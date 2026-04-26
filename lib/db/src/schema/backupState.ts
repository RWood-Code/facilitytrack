import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Singleton table holding OneDrive backup configuration and the last-run
 * status. Always 0 or 1 rows — `id` is hard-coded to 1.
 *
 * Populated when the user configures OneDrive in the Settings page; updated
 * after every backup attempt by the desktop nightly scheduler.
 */
export const backupState = sqliteTable("backup_state", {
  id: integer("id").primaryKey(),

  /** Master switch — true once the user has configured a refresh token. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),

  /** Microsoft Graph OAuth — Azure AD app registration values supplied by the customer. */
  clientId: text("client_id"),
  tenantId: text("tenant_id"),
  refreshToken: text("refresh_token"),

  /** Folder inside the user's OneDrive root, e.g. `FacilityTrack/Backups`. */
  targetFolder: text("target_folder").notNull().default("FacilityTrack/Backups"),

  /** Hour of day (0-23, machine-local) at which the nightly backup runs. */
  scheduleHour: integer("schedule_hour").notNull().default(2),

  /** Last attempt regardless of outcome. */
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
  /** Last *successful* upload. */
  lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
  /** Error message from the last failed attempt; cleared on success. */
  lastError: text("last_error"),
  /** Size of the most recently uploaded SQLite file, in bytes. */
  lastBackupBytes: integer("last_backup_bytes"),
  /** Remote path inside the user's OneDrive (`/FacilityTrack/Backups/2026-04-26.sqlite`). */
  lastBackupRemotePath: text("last_backup_remote_path"),
  /** Number of consecutive failures since the last success — drives banner colour. */
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),

  /**
   * True when the most recent token-endpoint exchange came back with an error
   * meaning the stored Microsoft refresh token is no longer accepted (e.g.
   * `invalid_grant`, `interaction_required` — typically because the user
   * changed their password, signed out everywhere, or the token aged past
   * Microsoft's 90-day inactivity window). Until the user runs the
   * "Reconnect to OneDrive" device-code flow again, retries are guaranteed
   * to fail, so the UI promotes a prominent re-auth call-to-action and we
   * file a notification so they notice from any page.
   *
   * Cleared on a successful backup, on `configureBackup`, and on `disableBackup`.
   */
  needsReauth: integer("needs_reauth", { mode: "boolean" }).notNull().default(false),

  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type BackupState = typeof backupState.$inferSelect;
export type NewBackupState = typeof backupState.$inferInsert;
