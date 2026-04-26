import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { eq } from "drizzle-orm";

const TENANT = "common";
const CLIENT_ID = "test-client-id";
const REFRESH = "refresh-1";
const FOLDER = "FacilityTrack/Backups";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const UPLOAD_SESSION_URL_RE = /createUploadSession$/;
const UPLOAD_URL = "https://upload.example.com/session/abc123";

let tempDir: string;
let backup: typeof import("./backup");
let dbMod: typeof import("@workspace/db");

/**
 * Programmable fetch mock. Tests register handlers in registration order; the
 * first matcher wins. Each handler is consumed unless it sets `persist: true`.
 *
 * This deliberately replaces the real Microsoft Graph network so the test
 * suite runs offline. We use a hand-rolled queue rather than undici's
 * MockAgent because we need fine-grained control over per-attempt responses
 * and because MockAgent state can be tricky to reset cleanly between tests.
 */
interface FetchHandler {
  match: (url: string, init?: RequestInit) => boolean;
  respond: () => Response | Promise<Response>;
  persist?: boolean;
  label?: string;
}

const fetchHandlers: FetchHandler[] = [];
let fetchSpy: MockInstance | null = null;
const fetchCalls: { url: string; method: string }[] = [];

function pushHandler(handler: FetchHandler) {
  fetchHandlers.push(handler);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

function expectToken(opts: {
  status?: number;
  body?: unknown;
  persist?: boolean;
} = {}) {
  pushHandler({
    label: "token",
    persist: opts.persist,
    match: (url, init) =>
      url === TOKEN_URL && (init?.method ?? "GET").toUpperCase() === "POST",
    respond: () => jsonResponse(opts.status ?? 200, opts.body ?? { access_token: "tok-default" }),
  });
}

function expectCreateUploadSession(opts: { status?: number; persist?: boolean } = {}) {
  pushHandler({
    label: "createUploadSession",
    persist: opts.persist,
    match: (url, init) =>
      UPLOAD_SESSION_URL_RE.test(url) && (init?.method ?? "GET").toUpperCase() === "POST",
    respond: () =>
      opts.status && opts.status >= 400
        ? textResponse(opts.status, "service unavailable")
        : jsonResponse(200, { uploadUrl: UPLOAD_URL }),
  });
}

function expectChunkPut(opts: { status?: number; persist?: boolean } = {}) {
  pushHandler({
    label: "chunkPut",
    persist: opts.persist,
    match: (url, init) =>
      url === UPLOAD_URL && (init?.method ?? "GET").toUpperCase() === "PUT",
    respond: () => jsonResponse(opts.status ?? 201, { id: "uploaded-item-id" }),
  });
}

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ft-backup-test-"));
  process.env.FACILITYTRACK_DB_PATH = path.join(tempDir, "test.sqlite");
  dbMod = await import("@workspace/db");
  backup = await import("./backup");
});

afterAll(async () => {
  dbMod.closeDb();
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env.FACILITYTRACK_DB_PATH;
});

beforeEach(async () => {
  fetchHandlers.length = 0;
  fetchCalls.length = 0;
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();
      fetchCalls.push({ url, method });
      const idx = fetchHandlers.findIndex((h) => h.match(url, init));
      if (idx === -1) {
        throw new Error(
          `No mock fetch handler for ${method} ${url}. Registered: ${fetchHandlers
            .map((h) => h.label ?? "?")
            .join(", ")}`,
        );
      }
      const handler = fetchHandlers[idx];
      if (!handler.persist) fetchHandlers.splice(idx, 1);
      return handler.respond();
    });

  await dbMod.getDb().delete(dbMod.backupState).where(eq(dbMod.backupState.id, 1));
});

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

async function configure(
  overrides: Partial<{
    clientId: string;
    tenantId: string;
    refreshToken: string;
    targetFolder: string;
    scheduleHour: number;
  }> = {},
) {
  return backup.configureBackup({
    clientId: CLIENT_ID,
    tenantId: TENANT,
    refreshToken: REFRESH,
    targetFolder: FOLDER,
    scheduleHour: 2,
    ...overrides,
  });
}

describe("dueForBackup", () => {
  const baseState = {
    id: 1,
    enabled: true,
    clientId: CLIENT_ID,
    tenantId: TENANT,
    refreshToken: REFRESH,
    targetFolder: FOLDER,
    scheduleHour: 2,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastBackupBytes: null,
    lastBackupRemotePath: null,
    consecutiveFailures: 0,
    updatedAt: new Date(),
  } satisfies import("@workspace/db").BackupState;

  it("returns false when backups are disabled", () => {
    const now = new Date(2026, 3, 26, 9, 0, 0);
    expect(backup.dueForBackup({ ...baseState, enabled: false }, now)).toBe(false);
  });

  it("never run: false before the configured scheduleHour", () => {
    const now = new Date(2026, 3, 26, 1, 0, 0);
    expect(backup.dueForBackup(baseState, now)).toBe(false);
  });

  it("never run: true once we reach the configured scheduleHour", () => {
    const now = new Date(2026, 3, 26, 2, 0, 0);
    expect(backup.dueForBackup(baseState, now)).toBe(true);
  });

  it("never run: still true many hours after the scheduleHour", () => {
    const now = new Date(2026, 3, 26, 14, 0, 0);
    expect(backup.dueForBackup(baseState, now)).toBe(true);
  });

  it("just-ran (a few hours ago): false", () => {
    const lastSuccessAt = new Date(2026, 3, 26, 2, 0, 0);
    const now = new Date(2026, 3, 26, 5, 0, 0);
    expect(backup.dueForBackup({ ...baseState, lastSuccessAt }, now)).toBe(false);
  });

  it("just under 23h ago: false (boundary)", () => {
    const now = new Date(2026, 3, 26, 4, 0, 0);
    const lastSuccessAt = new Date(now.getTime() - 22 * 60 * 60 * 1000 - 59 * 60 * 1000);
    expect(backup.dueForBackup({ ...baseState, lastSuccessAt }, now)).toBe(false);
  });

  it("23h+ ago but before scheduleHour-of-day: false", () => {
    const lastSuccessAt = new Date(2026, 3, 25, 2, 0, 0);
    const now = new Date(2026, 3, 26, 1, 30, 0);
    expect(backup.dueForBackup({ ...baseState, lastSuccessAt }, now)).toBe(false);
  });

  it("24h+ ago and past scheduleHour-of-day: true", () => {
    const lastSuccessAt = new Date(2026, 3, 25, 2, 0, 0);
    const now = new Date(2026, 3, 26, 2, 30, 0);
    expect(backup.dueForBackup({ ...baseState, lastSuccessAt }, now)).toBe(true);
  });

  it("36h+ ago: true regardless of hour-of-day", () => {
    const lastSuccessAt = new Date(2026, 3, 24, 2, 0, 0);
    const now = new Date(2026, 3, 26, 1, 0, 0);
    expect(backup.dueForBackup({ ...baseState, lastSuccessAt }, now)).toBe(true);
  });
});

describe("getBackupState / configureBackup", () => {
  it("lazily creates the singleton row with defaults", async () => {
    const state = await backup.getBackupState();
    expect(state.id).toBe(1);
    expect(state.enabled).toBe(false);
    expect(state.targetFolder).toBe("FacilityTrack/Backups");
    expect(state.scheduleHour).toBe(2);
    expect(state.consecutiveFailures).toBe(0);
  });

  it("configureBackup persists fields and enables backups", async () => {
    const state = await configure({ scheduleHour: 5, targetFolder: "Foo/Bar" });
    expect(state.enabled).toBe(true);
    expect(state.clientId).toBe(CLIENT_ID);
    expect(state.tenantId).toBe(TENANT);
    expect(state.refreshToken).toBe(REFRESH);
    expect(state.targetFolder).toBe("Foo/Bar");
    expect(state.scheduleHour).toBe(5);
  });

  it("disableBackup clears the refresh token and flips enabled off", async () => {
    await configure();
    const state = await backup.disableBackup();
    expect(state.enabled).toBe(false);
    expect(state.refreshToken).toBeNull();
  });
});

describe("runBackupNow — token exchange (getAccessToken via runBackupNow)", () => {
  it("happy path: exchanges refresh token, uploads, records success", async () => {
    await configure();
    expectToken({ body: { access_token: "tok-1" } });
    expectCreateUploadSession();
    expectChunkPut();

    const result = await backup.runBackupNow();

    expect(result.ok).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.remotePath).toMatch(
      /^\/FacilityTrack\/Backups\/facilitytrack-\d{4}-\d{2}-\d{2}T\d{4}Z\.sqlite$/,
    );

    const state = await backup.getBackupState();
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
    expect(state.lastError).toBeNull();
    expect(state.lastBackupBytes).toBe(result.bytes);
    expect(state.lastBackupRemotePath).toBe(result.remotePath);
    expect(state.consecutiveFailures).toBe(0);
    // Refresh token must NOT have been overwritten when Microsoft didn't rotate it.
    expect(state.refreshToken).toBe(REFRESH);

    // Verify we hit Microsoft endpoints in the expected order.
    expect(fetchCalls[0]).toEqual({ url: TOKEN_URL, method: "POST" });
    expect(fetchCalls[1].method).toBe("POST");
    expect(fetchCalls[1].url).toMatch(/createUploadSession$/);
    expect(fetchCalls[2]).toEqual({ url: UPLOAD_URL, method: "PUT" });
  });

  it("rotates the refresh token when Microsoft returns a new one", async () => {
    await configure();
    expectToken({
      body: { access_token: "tok-2", refresh_token: "rotated-refresh-token" },
    });
    expectCreateUploadSession();
    expectChunkPut();

    const result = await backup.runBackupNow();
    expect(result.ok).toBe(true);

    const state = await backup.getBackupState();
    expect(state.refreshToken).toBe("rotated-refresh-token");
  });

  it("does NOT overwrite refresh token if Microsoft echoes the same value", async () => {
    await configure();
    expectToken({
      body: { access_token: "tok-3", refresh_token: REFRESH },
    });
    expectCreateUploadSession();
    expectChunkPut();

    await backup.runBackupNow();
    const state = await backup.getBackupState();
    expect(state.refreshToken).toBe(REFRESH);
  });

  it("fails with a clear error when the token endpoint rejects all attempts", async () => {
    await configure();
    expectToken({
      status: 400,
      body: { error: "invalid_grant", error_description: "expired" },
      persist: true,
    });

    const result = await backup.runBackupNow();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Microsoft token endpoint returned 400/);

    const state = await backup.getBackupState();
    expect(state.lastError).toMatch(/Microsoft token endpoint returned 400/);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.lastSuccessAt).toBeNull();
  });

  it("returns ok:false without throwing when backups are not enabled", async () => {
    const result = await backup.runBackupNow();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Backups are not enabled");
  });

  it("regression: clears the in-flight singleton even on the early 'not enabled' return", async () => {
    // Issue: an earlier version of `runBackupNow` returned early for the
    // disabled case BEFORE the try/finally block, so `runningPromise` was
    // never reset and every subsequent call short-circuited to the cached
    // {ok:false, "Backups are not enabled"} forever — even after the user
    // re-enabled backups.
    const first = await backup.runBackupNow();
    expect(first.ok).toBe(false);

    await configure();
    expectToken({ body: { access_token: "tok-after-enable" } });
    expectCreateUploadSession();
    expectChunkPut();

    const second = await backup.runBackupNow();
    expect(second.ok).toBe(true);
  });
});

describe("runBackupNow — retry behaviour", () => {
  it("retries on transient failure and succeeds on a later attempt", async () => {
    await configure();
    // Attempt 1: token fails with a 503.
    expectToken({ status: 503, body: { error: "service_unavailable" } });
    // Attempt 2: token succeeds, then the upload pipeline completes.
    expectToken({ body: { access_token: "tok-retry" } });
    expectCreateUploadSession();
    expectChunkPut();

    const result = await backup.runBackupNow();
    expect(result.ok).toBe(true);

    const state = await backup.getBackupState();
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastError).toBeNull();
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("records lastError + increments consecutiveFailures after MAX_RETRIES upload failures", async () => {
    await configure();
    expectToken({ persist: true });
    expectCreateUploadSession({ status: 503, persist: true });

    const result = await backup.runBackupNow();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/createUploadSession failed/);

    const state = await backup.getBackupState();
    expect(state.consecutiveFailures).toBe(1);
    expect(state.lastError).toMatch(/createUploadSession failed/);
    expect(state.lastSuccessAt).toBeNull();
  });

  it("increments consecutiveFailures across two failed runs", async () => {
    await configure();
    expectToken({
      status: 401,
      body: { error: "invalid_grant" },
      persist: true,
    });

    await backup.runBackupNow();
    await backup.runBackupNow();

    const state = await backup.getBackupState();
    expect(state.consecutiveFailures).toBe(2);
  });

  it("resets consecutiveFailures back to 0 after a subsequent success", async () => {
    await configure();
    // First run fails on every attempt.
    expectToken({
      status: 500,
      body: { error: "boom" },
      persist: true,
    });
    const failed = await backup.runBackupNow();
    expect(failed.ok).toBe(false);

    // Wipe handlers and queue a successful run.
    fetchHandlers.length = 0;
    expectToken({ body: { access_token: "tok-ok" } });
    expectCreateUploadSession();
    expectChunkPut();

    const ok = await backup.runBackupNow();
    expect(ok.ok).toBe(true);

    const state = await backup.getBackupState();
    expect(state.consecutiveFailures).toBe(0);
  });

  it("concurrent calls share the same in-flight backup promise", async () => {
    await configure();
    expectToken({ body: { access_token: "tok-c" } });
    expectCreateUploadSession();
    expectChunkPut();

    const [a, b] = await Promise.all([
      backup.runBackupNow(),
      backup.runBackupNow(),
    ]);

    // Both calls returned the same in-flight promise, so a single set of mock
    // handlers (above) was sufficient — if the second call triggered a
    // duplicate run it would have thrown "No mock fetch handler".
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.remotePath).toBe(b.remotePath);
    expect(a.bytes).toBe(b.bytes);
  });
});

describe("getPublicBackupState", () => {
  it("never includes the refresh token", async () => {
    await configure();
    const pub = await backup.getPublicBackupState();
    expect(pub).not.toHaveProperty("refreshToken");
    expect(pub.configured).toBe(true);
    expect(pub.enabled).toBe(true);
    expect(pub.clientId).toBe(CLIENT_ID);
    expect(pub.tenantId).toBe(TENANT);
  });

  it("reports configured=false until configureBackup has been called", async () => {
    const pub = await backup.getPublicBackupState();
    expect(pub.configured).toBe(false);
    expect(pub.enabled).toBe(false);
  });
});
