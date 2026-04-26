import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let cachedDb: AppDatabase | null = null;
let cachedSqlite: Database.Database | null = null;
let cachedDbPath: string | null = null;

/**
 * Resolve the SQLite database file path used by FacilityTrack.
 *
 * Priority:
 *   1. Explicit env var `FACILITYTRACK_DB_PATH`
 *   2. Repl-friendly fallback (`<workspace>/.data/facilitytrack.sqlite`)
 *      which is fine for local development.
 *
 * The Electron entry point passes its own resolved path
 * (`app.getPath("userData") + "/db.sqlite"`).
 */
export function resolveDbPath(): string {
  if (process.env.FACILITYTRACK_DB_PATH) {
    return process.env.FACILITYTRACK_DB_PATH;
  }
  const cwd = process.cwd();
  return path.join(cwd, ".data", "facilitytrack.sqlite");
}

function findMigrationsFolder(): string | null {
  if (process.env.FACILITYTRACK_MIGRATIONS_PATH) {
    return process.env.FACILITYTRACK_MIGRATIONS_PATH;
  }

  let here: string;
  try {
    here = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }

  // Walk upwards from both `here` and `cwd` looking for `lib/db/drizzle`,
  // and also consider sibling `drizzle/` directories. This works whether the
  // db package is consumed via TS source (workspace dev) or bundled into a
  // sibling artifact's dist folder.
  const seeds = [here, process.cwd()];
  const checked = new Set<string>();
  for (const seed of seeds) {
    let dir = seed;
    for (let i = 0; i < 8; i++) {
      const localCandidates = [
        path.join(dir, "drizzle"),
        path.join(dir, "lib", "db", "drizzle"),
      ];
      for (const c of localCandidates) {
        if (checked.has(c)) continue;
        checked.add(c);
        if (fs.existsSync(path.join(c, "meta", "_journal.json"))) {
          return c;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * Open (or return) the singleton SQLite database, applying any pending
 * migrations on first call.
 */
export function getDb(dbPath?: string): AppDatabase {
  const resolved = dbPath ?? resolveDbPath();

  if (cachedDb && cachedDbPath === resolved) {
    return cachedDb;
  }

  if (cachedSqlite) {
    cachedSqlite.close();
    cachedSqlite = null;
    cachedDb = null;
  }

  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(resolved);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");

  const drizzleDb = drizzle(sqlite, { schema });

  const migrationsFolder = findMigrationsFolder();
  if (migrationsFolder) {
    try {
      migrate(drizzleDb, { migrationsFolder });
    } catch (err) {
      sqlite.close();
      throw new Error(
        `Failed to apply migrations from ${migrationsFolder}: ${(err as Error).message}`,
      );
    }
  }

  cachedSqlite = sqlite;
  cachedDb = drizzleDb;
  cachedDbPath = resolved;
  return drizzleDb;
}

/**
 * Convenience proxy: importing `db` lazily opens the database on first use.
 * Existing code that does `import { db } from "@workspace/db"` continues to
 * work without changes.
 */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as AppDatabase;

/** Returns the absolute path to the currently opened SQLite file (or null). */
export function getDbPath(): string | null {
  return cachedDbPath;
}

/** Returns the underlying better-sqlite3 handle for backups, vacuum, etc. */
export function getRawSqlite(): Database.Database | null {
  return cachedSqlite;
}

/** Close the database — used by Electron quit handlers and tests. */
export function closeDb(): void {
  if (cachedSqlite) {
    cachedSqlite.close();
    cachedSqlite = null;
    cachedDb = null;
    cachedDbPath = null;
  }
}

export * from "./schema";
