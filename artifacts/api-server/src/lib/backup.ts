/**
 * OneDrive nightly backup for the FacilityTrack SQLite database.
 *
 * The desktop wrapper (Electron) calls `startBackupScheduler()` once on
 * startup. The scheduler:
 *   1. Reads `backup_state` from SQLite.
 *   2. If backups are enabled and the last successful run was >24h ago (or
 *      never), runs a backup immediately.
 *   3. Sleeps until the next configured `scheduleHour` and runs again,
 *      forever.
 *
 * Backups use SQLite's built-in `db.backup()` to write a consistent snapshot
 * to a temp file, then upload the snapshot to OneDrive via the Microsoft
 * Graph API using an upload session (works for files of any size).
 *
 * We never ship our own Azure credentials — the customer registers their own
 * Azure AD app and supplies `clientId` + `tenantId` + `refreshToken`. The
 * desktop docs explain how.
 */

import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  backupState,
  getDb,
  getRawSqlite,
  notificationsTable,
  resolveDbPath,
  type BackupState,
} from "@workspace/db";
import { logger } from "./logger";

const SINGLETON_ID = 1;
const NIGHTLY_INTERVAL_MS = 60 * 60 * 1000; // wake every hour, decide if it's time
const MAX_RETRIES = 3;
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MiB per chunk for upload sessions

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let runningPromise: Promise<BackupRunResult> | null = null;

export interface BackupRunResult {
  ok: boolean;
  bytes?: number;
  remotePath?: string;
  error?: string;
  /** True when the failure was specifically "Microsoft refresh token rejected". */
  needsReauth?: boolean;
}

/**
 * Read the singleton row, returning a zeroed default if it doesn't exist
 * yet.
 */
export async function getBackupState(): Promise<BackupState> {
  const db = getDb();
  const rows = await db
    .select()
    .from(backupState)
    .where(eq(backupState.id, SINGLETON_ID));
  if (rows[0]) return rows[0];

  // Lazily insert the singleton on first access.
  const fresh: BackupState = {
    id: SINGLETON_ID,
    enabled: false,
    clientId: null,
    tenantId: null,
    refreshToken: null,
    targetFolder: "FacilityTrack/Backups",
    scheduleHour: 2,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastBackupBytes: null,
    lastBackupRemotePath: null,
    consecutiveFailures: 0,
    needsReauth: false,
    updatedAt: new Date(),
  };
  await db.insert(backupState).values(fresh).onConflictDoNothing();
  return fresh;
}

export interface BackupConfig {
  clientId: string;
  tenantId?: string;
  refreshToken: string;
  targetFolder?: string;
  scheduleHour?: number;
}

export async function configureBackup(input: BackupConfig): Promise<BackupState> {
  const db = getDb();
  await getBackupState(); // ensure row exists
  const next: Partial<BackupState> = {
    enabled: true,
    clientId: input.clientId.trim(),
    tenantId: (input.tenantId ?? "common").trim(),
    refreshToken: input.refreshToken.trim(),
    targetFolder: input.targetFolder?.trim() || "FacilityTrack/Backups",
    scheduleHour:
      typeof input.scheduleHour === "number" &&
      input.scheduleHour >= 0 &&
      input.scheduleHour <= 23
        ? input.scheduleHour
        : 2,
    // Reconnecting supplies a fresh refresh token, so any previous re-auth
    // requirement is satisfied — clear the flag and the lingering error.
    needsReauth: false,
    lastError: null,
    updatedAt: new Date(),
  };
  await db.update(backupState).set(next).where(eq(backupState.id, SINGLETON_ID));
  return await getBackupState();
}

export interface BackupScheduleInput {
  targetFolder?: string;
  scheduleHour?: number;
}

/**
 * Update only the schedule/folder. Used by the Settings UI when the user
 * tweaks their backup destination after the OneDrive credentials have
 * already been configured by the desktop device-code flow — there's no
 * need (or way) to re-enter credentials just to change the folder name.
 */
export async function updateBackupSchedule(
  input: BackupScheduleInput,
): Promise<BackupState> {
  const db = getDb();
  const current = await getBackupState();
  const next: Partial<BackupState> = {
    targetFolder:
      input.targetFolder?.trim() || current.targetFolder || "FacilityTrack/Backups",
    scheduleHour:
      typeof input.scheduleHour === "number" &&
      input.scheduleHour >= 0 &&
      input.scheduleHour <= 23
        ? input.scheduleHour
        : current.scheduleHour,
    updatedAt: new Date(),
  };
  await db.update(backupState).set(next).where(eq(backupState.id, SINGLETON_ID));
  return await getBackupState();
}

export async function disableBackup(): Promise<BackupState> {
  const db = getDb();
  await getBackupState();
  await db
    .update(backupState)
    .set({
      enabled: false,
      refreshToken: null,
      // No point in nagging about re-auth when backups are off.
      needsReauth: false,
      updatedAt: new Date(),
    })
    .where(eq(backupState.id, SINGLETON_ID));
  return await getBackupState();
}

/**
 * Write the SQLite snapshot to a temp file using the better-sqlite3 backup
 * API (consistent point-in-time copy that respects WAL).
 */
async function snapshotDbToTemp(): Promise<{ tmpPath: string; bytes: number }> {
  const sqlite = getRawSqlite();
  const dbPath = resolveDbPath();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "facilitytrack-backup-"));
  const tmpPath = path.join(tmpDir, path.basename(dbPath));

  if (sqlite && typeof sqlite.backup === "function") {
    await sqlite.backup(tmpPath);
  } else {
    // Fallback: best-effort file copy. WAL mode means this may not be
    // perfectly consistent, but it's close enough as a degraded path.
    await fs.copyFile(dbPath, tmpPath);
  }

  const stat = await fs.stat(tmpPath);
  return { tmpPath, bytes: stat.size };
}

/**
 * OAuth `error` codes returned by Microsoft's token endpoint that mean
 * "the stored refresh token will not work again — the user must complete
 * the device-code sign-in again". Other 4xx errors (e.g. transient network
 * blips surfaced as 503, malformed request from a momentarily corrupt body)
 * are not in this list and stay classified as ordinary failures so a
 * retry/the next nightly run gets a chance to recover.
 *
 * See https://learn.microsoft.com/azure/active-directory/develop/reference-aadsts-error-codes
 */
const REAUTH_OAUTH_ERRORS = new Set([
  "invalid_grant",
  "interaction_required",
  "consent_required",
  "login_required",
  "unauthorized_client",
  "invalid_client",
]);

/**
 * Error subclass marking "the refresh token is no longer accepted — the
 * user must reconnect OneDrive". Thrown by `getAccessToken` and inspected
 * by `runBackupNow` so we (a) skip pointless retries and (b) flip the
 * `needsReauth` flag.
 */
class RefreshTokenRejectedError extends Error {
  readonly needsReauth = true as const;
  constructor(message: string) {
    super(message);
    this.name = "RefreshTokenRejectedError";
  }
}

function isRefreshTokenRejected(err: unknown): err is RefreshTokenRejectedError {
  return err instanceof RefreshTokenRejectedError;
}

/**
 * Decide whether a non-OK response from the Microsoft token endpoint means
 * the refresh token itself is dead (vs. a transient failure). Microsoft
 * returns OAuth-style JSON errors with an `error` code on 4xx; treat the
 * codes in `REAUTH_OAUTH_ERRORS` as "needs re-auth", everything else
 * (5xx, network-y 4xx without a recognised code) as a normal failure.
 */
function classifyTokenErrorBody(status: number, rawBody: string): {
  needsReauth: boolean;
  message: string;
} {
  type OAuthError = { error?: unknown; error_description?: unknown };
  let parsed: OAuthError | null = null;
  try {
    const raw: unknown = JSON.parse(rawBody);
    if (raw && typeof raw === "object") {
      parsed = raw as OAuthError;
    }
  } catch {
    parsed = null;
  }
  const code = typeof parsed?.error === "string" ? parsed.error : null;
  const description =
    typeof parsed?.error_description === "string"
      ? parsed.error_description
      : rawBody;
  const needsReauth =
    status >= 400 &&
    status < 500 &&
    code !== null &&
    REAUTH_OAUTH_ERRORS.has(code);
  const message = code
    ? `Microsoft rejected the refresh token (${code}): ${description}`
    : `Microsoft token endpoint returned ${status}: ${rawBody}`;
  return { needsReauth, message };
}

/**
 * Exchange the stored refresh token for a fresh access token via the
 * Microsoft identity platform. Throws `RefreshTokenRejectedError` when
 * Microsoft tells us the refresh token won't work again.
 *
 * Exported (under `getAccessTokenForCurrentBackup`) so other modules — like
 * the OneDrive folder-picker proxy — can call Microsoft Graph on behalf of
 * the configured user without going through `runBackupNow`.
 */
async function getAccessToken(state: BackupState): Promise<string> {
  if (!state.clientId || !state.refreshToken) {
    throw new Error("Backup is not configured (missing clientId/refreshToken)");
  }
  const tenant = state.tenantId || "common";
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: state.clientId,
    grant_type: "refresh_token",
    refresh_token: state.refreshToken,
    scope: "Files.ReadWrite offline_access",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    const { needsReauth, message } = classifyTokenErrorBody(res.status, text);
    if (needsReauth) {
      throw new RefreshTokenRejectedError(message);
    }
    throw new Error(message);
  }
  const body = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!body.access_token) {
    throw new Error("Microsoft token response missing access_token");
  }
  if (body.refresh_token && body.refresh_token !== state.refreshToken) {
    // Microsoft sometimes rotates the refresh token — persist the new one.
    const db = getDb();
    await db
      .update(backupState)
      .set({ refreshToken: body.refresh_token, updatedAt: new Date() })
      .where(eq(backupState.id, SINGLETON_ID));
  }
  return body.access_token;
}

function buildRemoteName(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  return `facilitytrack-${yyyy}-${mm}-${dd}T${hh}${mi}Z.sqlite`;
}

/**
 * Upload `localPath` to `<folder>/<remoteName>` in the user's OneDrive via
 * an upload session. Returns the remote item path on success, throws on
 * failure.
 */
async function uploadViaSession(
  accessToken: string,
  folder: string,
  remoteName: string,
  localPath: string,
  totalBytes: number,
): Promise<string> {
  const remotePath = `/${folder.replace(/^\/+|\/+$/g, "")}/${remoteName}`;
  const sessionUrl = `https://graph.microsoft.com/v1.0/me/drive/root:${encodeURI(
    remotePath,
  )}:/createUploadSession`;
  const sessionRes = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item: {
        "@microsoft.graph.conflictBehavior": "replace",
        name: remoteName,
      },
    }),
  });
  if (!sessionRes.ok) {
    const text = await sessionRes.text();
    throw new Error(`createUploadSession failed (${sessionRes.status}): ${text}`);
  }
  const session = (await sessionRes.json()) as { uploadUrl: string };
  if (!session.uploadUrl) {
    throw new Error("createUploadSession did not return an uploadUrl");
  }

  const fh = await fs.open(localPath, "r");
  try {
    let offset = 0;
    while (offset < totalBytes) {
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, totalBytes);
      const chunkSize = end - offset;
      const buf = Buffer.alloc(chunkSize);
      await fh.read(buf, 0, chunkSize, offset);
      const range = `bytes ${offset}-${end - 1}/${totalBytes}`;
      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunkSize),
          "Content-Range": range,
        },
        body: buf,
      });
      if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
        const text = await res.text();
        throw new Error(`Chunk PUT ${range} failed (${res.status}): ${text}`);
      }
      offset = end;
    }
  } finally {
    await fh.close();
  }
  return remotePath;
}

async function recordResult(
  ok: boolean,
  patch: Partial<BackupState>,
): Promise<{ previous: BackupState; next: BackupState }> {
  const db = getDb();
  const previous = await getBackupState();
  const merged: Partial<BackupState> = {
    ...patch,
    lastAttemptAt: new Date(),
    consecutiveFailures: ok ? 0 : previous.consecutiveFailures + 1,
    updatedAt: new Date(),
  };
  await db.update(backupState).set(merged).where(eq(backupState.id, SINGLETON_ID));
  const next = await getBackupState();
  return { previous, next };
}

/**
 * Insert a one-off in-app notification so the bell icon in the header lights
 * up the first time we detect that the OneDrive refresh token has expired.
 * Without this, customers wouldn't see the issue until they happened to
 * visit Settings — which is exactly the silent-failure mode this task is
 * trying to prevent.
 *
 * Best-effort: a failure to insert the notification (e.g. a transient DB
 * lock) must never mask the underlying backup error, so we swallow and log.
 */
async function fileReauthNotification(): Promise<void> {
  try {
    const db = getDb();
    await db.insert(notificationsTable).values({
      title: "OneDrive sign-in expired",
      message:
        "Your OneDrive sign-in has expired and FacilityTrack can no longer upload backups. " +
        "Open Settings and click \"Reconnect to OneDrive\" to restore nightly backups.",
      type: "error",
      relatedEntityType: "backup",
      relatedEntityId: SINGLETON_ID,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to file OneDrive re-auth notification");
  }
}

/**
 * Run one backup attempt with up to `MAX_RETRIES` retries. Records the
 * outcome in `backup_state` and returns a structured result.
 *
 * Safe to call concurrently — overlapping calls share the same in-flight
 * promise.
 */
export async function runBackupNow(): Promise<BackupRunResult> {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    let lastError: Error | null = null;
    let needsReauth = false;
    let snapshot: { tmpPath: string; bytes: number } | null = null;
    try {
      const state = await getBackupState();
      if (!state.enabled) {
        return { ok: false, error: "Backups are not enabled" };
      }
      snapshot = await snapshotDbToTemp();
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const token = await getAccessToken(state);
          const remoteName = buildRemoteName();
          const remotePath = await uploadViaSession(
            token,
            state.targetFolder,
            remoteName,
            snapshot.tmpPath,
            snapshot.bytes,
          );
          await recordResult(true, {
            lastSuccessAt: new Date(),
            lastError: null,
            lastBackupBytes: snapshot.bytes,
            lastBackupRemotePath: remotePath,
            // A successful upload by definition means the refresh token is
            // working again, so clear any earlier re-auth flag.
            needsReauth: false,
          });
          logger.info({ remotePath, bytes: snapshot.bytes }, "OneDrive backup succeeded");
          return { ok: true, bytes: snapshot.bytes, remotePath };
        } catch (err) {
          lastError = err as Error;
          if (isRefreshTokenRejected(err)) {
            // Microsoft told us the refresh token is dead — retrying with
            // the same token will only produce more 4xxs. Bail out of the
            // retry loop immediately and surface the re-auth state.
            needsReauth = true;
            logger.warn(
              { err, attempt },
              "OneDrive refresh token rejected — flagging needsReauth",
            );
            break;
          }
          const wait = Math.min(30_000, 1000 * Math.pow(2, attempt));
          logger.warn(
            { err, attempt, nextRetryMs: wait },
            "OneDrive backup attempt failed",
          );
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, wait));
          }
        }
      }
      const message = lastError?.message ?? "Unknown error";
      const { previous } = await recordResult(false, {
        lastError: message,
        needsReauth,
      });
      // File a notification only on the false→true transition so the bell
      // doesn't spam a new badge for every retry/nightly tick once we're
      // already in the re-auth state.
      if (needsReauth && !previous.needsReauth) {
        await fileReauthNotification();
      }
      return { ok: false, error: message, needsReauth };
    } finally {
      if (snapshot) {
        try {
          await fs.rm(path.dirname(snapshot.tmpPath), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      runningPromise = null;
    }
  })();
  return runningPromise;
}

export function dueForBackup(state: BackupState, now: Date): boolean {
  if (!state.enabled) return false;
  // First-ever run: fire as soon as the scheduler ticks past the configured
  // hour-of-day so customers don't wait until tomorrow morning to see the
  // first backup land.
  if (!state.lastSuccessAt) {
    return now.getHours() >= state.scheduleHour;
  }
  const ageMs = now.getTime() - state.lastSuccessAt.getTime();
  // Don't fire more than once per ~day even if the user reconfigures things.
  if (ageMs < 23 * 60 * 60 * 1000) return false;
  // Past the daily cutoff: fire only once we've reached the configured hour.
  // If the scheduler missed the window (e.g. PC was off at 02:00 and started
  // up at 09:00), `now.getHours() >= scheduleHour` will still be true and we
  // catch up. If we're more than 36h overdue, fire regardless of hour so a
  // long-asleep machine isn't left without a backup just because it woke
  // before the configured hour.
  if (ageMs >= 36 * 60 * 60 * 1000) return true;
  return now.getHours() >= state.scheduleHour;
}

/**
 * Start the in-process scheduler. Idempotent — calling twice is a no-op.
 * Returns a `stop` function for tests.
 */
export function startBackupScheduler(): () => void {
  if (schedulerStarted) {
    return () => {
      if (schedulerTimer) clearInterval(schedulerTimer);
      schedulerTimer = null;
      schedulerStarted = false;
    };
  }
  schedulerStarted = true;

  const tick = async () => {
    try {
      const state = await getBackupState();
      if (dueForBackup(state, new Date())) {
        logger.info({ lastSuccessAt: state.lastSuccessAt }, "Nightly backup tick — running backup");
        await runBackupNow();
      }
    } catch (err) {
      logger.warn({ err }, "Backup scheduler tick failed");
    }
  };

  // Fire once shortly after startup so a stale install catches up immediately.
  setTimeout(() => {
    void tick();
  }, 30_000);

  schedulerTimer = setInterval(() => {
    void tick();
  }, NIGHTLY_INTERVAL_MS);

  return () => {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
    schedulerStarted = false;
  };
}

export interface PublicBackupState {
  enabled: boolean;
  configured: boolean;
  clientId: string | null;
  tenantId: string | null;
  targetFolder: string;
  scheduleHour: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastBackupBytes: number | null;
  lastBackupRemotePath: string | null;
  consecutiveFailures: number;
  /**
   * True when the most recent token-endpoint exchange said the refresh token
   * is rejected. The frontend uses this to promote a "Reconnect to OneDrive"
   * call-to-action instead of a generic "Last error" line.
   */
  needsReauth: boolean;
  inProgress: boolean;
}

/**
 * Fetch a fresh Microsoft Graph access token using the currently stored
 * refresh token. Throws if backups aren't configured yet.
 *
 * Used by the OneDrive folder-picker proxy so the renderer never sees the
 * access token directly.
 */
export async function getAccessTokenForCurrentBackup(): Promise<string> {
  const state = await getBackupState();
  return await getAccessToken(state);
}

export interface OneDriveFolderEntry {
  id: string;
  name: string;
  /** OneDrive path (no leading slash) of this folder, e.g. `Foo/Bar`. */
  path: string;
  /** True if this folder has at least one child folder. Lets the UI hint
   * whether drilling in will reveal anything. */
  hasChildFolders: boolean;
}

export interface OneDriveFolderListing {
  /** Normalised path that was listed (no leading slash; empty string = root). */
  path: string;
  /** Folders directly under `path`, sorted alphabetically. */
  folders: OneDriveFolderEntry[];
}

/**
 * Normalise a OneDrive folder path to a form Microsoft Graph accepts:
 *  - strip leading/trailing slashes
 *  - collapse runs of slashes
 *  - reject `..` segments and other dodgy bits
 *
 * Returns "" for the root.
 */
function normaliseFolderPath(input: string | undefined | null): string {
  if (!input) return "";
  const cleaned = input
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split("/");
  for (const p of parts) {
    if (!p || p === "." || p === "..") {
      throw new Error(`Invalid folder path segment: "${p}"`);
    }
  }
  return parts.join("/");
}

interface GraphChild {
  id: string;
  name: string;
  folder?: { childCount?: number };
  parentReference?: { path?: string };
}

interface GraphChildrenResponse {
  value: GraphChild[];
  "@odata.nextLink"?: string;
}

/**
 * List folders directly under `path` in the connected user's OneDrive.
 * Pass an empty/undefined `path` to list the drive root.
 *
 * Filters out files — only folders are returned, since this is used by the
 * "pick a backup destination" UI.
 */
export async function listOneDriveFolders(
  path: string | undefined,
): Promise<OneDriveFolderListing> {
  const normalised = normaliseFolderPath(path);
  const accessToken = await getAccessTokenForCurrentBackup();

  const baseUrl = normalised
    ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURI(normalised)}:/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

  // Ask Graph to only return the fields we care about. We deliberately
  // skip `$filter=folder ne null` because Graph's filter support on
  // `/children` is service-dependent (some tenants reject it with a 400)
  // — we filter to folders ourselves below, which is cheap because
  // `$select` keeps the payload small.
  const params = new URLSearchParams({
    $select: "id,name,folder,parentReference",
    $top: "200",
    $orderby: "name",
  });

  const folders: OneDriveFolderEntry[] = [];
  let next: string | null = `${baseUrl}?${params.toString()}`;
  while (next) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph children failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as GraphChildrenResponse;
    for (const child of body.value) {
      if (!child.folder) continue;
      folders.push({
        id: child.id,
        name: child.name,
        path: normalised ? `${normalised}/${child.name}` : child.name,
        hasChildFolders: (child.folder.childCount ?? 0) > 0,
      });
    }
    next = body["@odata.nextLink"] ?? null;
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { path: normalised, folders };
}

interface GraphCreatedFolder {
  id: string;
  name: string;
}

/**
 * Create a new folder named `name` under `parentPath` in the connected
 * user's OneDrive. If a folder with that name already exists, Graph
 * returns the existing one (we use `conflictBehavior: "fail"` so callers
 * get a clear 409 instead of silently picking up an unrelated folder).
 */
export async function createOneDriveFolder(
  parentPath: string | undefined,
  name: string,
): Promise<OneDriveFolderEntry> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Folder name is required");
  if (/[\\/:*?"<>|]/.test(trimmedName)) {
    throw new Error("Folder name contains invalid characters");
  }
  if (trimmedName === "." || trimmedName === "..") {
    throw new Error("Folder name is reserved");
  }
  const normalisedParent = normaliseFolderPath(parentPath);
  const accessToken = await getAccessTokenForCurrentBackup();

  const url = normalisedParent
    ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURI(normalisedParent)}:/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: trimmedName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409) {
      throw new Error(`A folder named "${trimmedName}" already exists here.`);
    }
    throw new Error(`Microsoft Graph createFolder failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as GraphCreatedFolder;
  return {
    id: body.id,
    name: body.name,
    path: normalisedParent ? `${normalisedParent}/${body.name}` : body.name,
    hasChildFolders: false,
  };
}

/** Shape exposed to the frontend — never includes the refresh token. */
export async function getPublicBackupState(): Promise<PublicBackupState> {
  const s = await getBackupState();
  return {
    enabled: s.enabled,
    configured: !!s.refreshToken && !!s.clientId,
    clientId: s.clientId,
    tenantId: s.tenantId,
    targetFolder: s.targetFolder,
    scheduleHour: s.scheduleHour,
    lastAttemptAt: s.lastAttemptAt ? s.lastAttemptAt.toISOString() : null,
    lastSuccessAt: s.lastSuccessAt ? s.lastSuccessAt.toISOString() : null,
    lastError: s.lastError,
    lastBackupBytes: s.lastBackupBytes,
    lastBackupRemotePath: s.lastBackupRemotePath,
    consecutiveFailures: s.consecutiveFailures,
    needsReauth: s.needsReauth,
    inProgress: runningPromise !== null,
  };
}
