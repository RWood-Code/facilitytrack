import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import * as fs from "node:fs";
import * as path from "node:path";

export const licensesTable = sqliteTable("licenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  status: text("status").notNull().default("active"), // active | revoked
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const validationsTable = sqliteTable("validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  licenseKey: text("license_key").notNull(),
  machineFingerprint: text("machine_fingerprint"),
  result: text("result").notNull(), // active | expired | revoked | unknown
  ipAddress: text("ip_address"),
  validatedAt: integer("validated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export type License = typeof licensesTable.$inferSelect;
export type Validation = typeof validationsTable.$inferSelect;

const schema = { licensesTable, validationsTable };

let cached: { db: BetterSQLite3Database<typeof schema>; raw: Database.Database } | null = null;

export function resolveLicenseDbPath(): string {
  if (process.env.LICENSE_DB_PATH) return process.env.LICENSE_DB_PATH;
  return path.resolve(process.cwd(), ".data", "licenses.sqlite");
}

export function getLicenseDb() {
  if (cached) return cached;
  const dbPath = resolveLicenseDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Inline migration — single table set, additive.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      machine_fingerprint TEXT,
      result TEXT NOT NULL,
      ip_address TEXT,
      validated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_validations_license_key ON validations(license_key);
    CREATE INDEX IF NOT EXISTS idx_validations_validated_at ON validations(validated_at);
  `);
  const db = drizzle(sqlite, { schema });
  cached = { db, raw: sqlite };
  return cached;
}
