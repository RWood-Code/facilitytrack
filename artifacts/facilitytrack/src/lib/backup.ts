/**
 * OneDrive backup client. Like the licence client, these endpoints sit
 * outside the OpenAPI-generated client to avoid a regen round-trip.
 */

export interface BackupStatus {
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
   * True when Microsoft has rejected the stored OneDrive refresh token (e.g.
   * the user changed their password or the token aged past Microsoft's
   * 90-day inactivity window). The UI surfaces this as a prominent
   * "Reconnect to OneDrive" call-to-action because retrying without
   * re-authenticating is guaranteed to fail.
   */
  needsReauth: boolean;
  inProgress: boolean;
}

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "") + "/api";

export async function fetchBackupStatus(): Promise<BackupStatus> {
  const res = await fetch(`${API_BASE}/backup/status`, { credentials: "include" });
  if (!res.ok) throw new Error(`Backup status request failed: ${res.status}`);
  return (await res.json()) as BackupStatus;
}

export interface ConfigureBackupInput {
  clientId: string;
  tenantId?: string;
  refreshToken: string;
  targetFolder?: string;
  scheduleHour?: number;
}

export async function configureBackup(input: ConfigureBackupInput): Promise<BackupStatus> {
  const res = await fetch(`${API_BASE}/backup/configure`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Configure failed (${res.status}): ${text}`);
  }
  return (await res.json()) as BackupStatus;
}

export interface UpdateBackupScheduleInput {
  targetFolder?: string;
  scheduleHour?: number;
}

/**
 * Update the backup folder/schedule without re-supplying credentials. Used
 * by the Settings UI after the desktop "Connect to OneDrive" device-code
 * flow has already populated `clientId`/`refreshToken`.
 */
export async function updateBackupSchedule(
  input: UpdateBackupScheduleInput,
): Promise<BackupStatus> {
  const res = await fetch(`${API_BASE}/backup/schedule`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save failed (${res.status}): ${text}`);
  }
  return (await res.json()) as BackupStatus;
}

export async function disableBackup(): Promise<BackupStatus> {
  const res = await fetch(`${API_BASE}/backup/disable`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Disable failed: ${res.status}`);
  return (await res.json()) as BackupStatus;
}

export async function runBackupNow(): Promise<{ ok: boolean; error?: string; state: BackupStatus }> {
  const res = await fetch(`${API_BASE}/backup/run`, {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as { ok: boolean; error?: string; state: BackupStatus };
}

// ---------------------------------------------------------------------------
// OneDrive folder picker — proxied through the api-server so the renderer
// never sees the Microsoft Graph access token.
// ---------------------------------------------------------------------------

export interface OneDriveFolderEntry {
  id: string;
  name: string;
  /** Path of this folder in the user's drive (no leading slash). */
  path: string;
  hasChildFolders: boolean;
}

export interface OneDriveFolderListing {
  /** The path that was listed; "" means the drive root. */
  path: string;
  folders: OneDriveFolderEntry[];
}

/**
 * List folders directly under `path` in the connected OneDrive account.
 * Pass `""` (or omit) to list the root.
 */
export async function listOneDriveFolders(
  path: string,
): Promise<OneDriveFolderListing> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : "";
  const res = await fetch(`${API_BASE}/backup/folders${qs}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Could not list folders (${res.status})`,
    );
  }
  return (await res.json()) as OneDriveFolderListing;
}

/** Create a new folder under `parentPath` in the connected OneDrive. */
export async function createOneDriveFolder(
  parentPath: string,
  name: string,
): Promise<OneDriveFolderEntry> {
  const res = await fetch(`${API_BASE}/backup/folders`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentPath, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Could not create folder (${res.status})`,
    );
  }
  return (await res.json()) as OneDriveFolderEntry;
}

export function formatBackupAge(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
