import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Singleton table holding the current licence activation. Always 0 or 1 rows
 * — `id` is hard-coded to 1. Updated whenever the user activates a new key
 * or a periodic revalidation succeeds.
 */
export const licenseState = sqliteTable("license_state", {
  id: integer("id").primaryKey(),
  licenseKey: text("license_key").notNull(),
  serverUrl: text("server_url").notNull(),
  /** Last `status` returned by the server (active|revoked|expired|unknown). */
  lastStatus: text("last_status").notNull(),
  /** ISO expiry returned by the server (epoch ms in DB). */
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  /** When we last successfully reached the server (epoch ms). */
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }).notNull(),
  /** When we last *attempted* validation, regardless of outcome. */
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }).notNull(),
  /** Customer name returned by server, for display in UI. */
  customerName: text("customer_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type LicenseState = typeof licenseState.$inferSelect;
export type NewLicenseState = typeof licenseState.$inferInsert;
