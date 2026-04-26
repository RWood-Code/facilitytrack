import { type Server } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { runSeedIfEmpty } from "./lib/seed";
import { startLicenseRevalidator } from "./lib/license";
import { startBackupScheduler } from "./lib/backup";

// Re-exported so the Electron main process can write OneDrive credentials
// straight into `backup_state` after the device-code OAuth flow completes,
// without going through the HTTP API (which requires a logged-in admin
// session).
export { configureBackup, getBackupState } from "./lib/backup";
export type { BackupConfig } from "./lib/backup";

export interface StartServerOptions {
  /** TCP port to bind. Defaults to `process.env.PORT` or `0` (random free port). */
  port?: number;
  /** Interface to bind. Defaults to `0.0.0.0` so LAN tablets can reach it. */
  host?: string;
  /** Absolute path to the SQLite database file. Sets `FACILITYTRACK_DB_PATH`. */
  dbPath?: string;
  /** Run the demo seed if the user table is empty. Defaults to `false`. */
  seedDemoData?: boolean;
}

export interface RunningServer {
  server: Server;
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

/**
 * Boot the Express backend in-process. Used by:
 *   - The Electron main process (`artifacts/desktop`).
 *   - Any embedded test harness.
 *   - The standalone `index.ts` entrypoint (Replit dev).
 *
 * Returns once the server is listening.
 */
export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  if (opts.dbPath) {
    process.env.FACILITYTRACK_DB_PATH = opts.dbPath;
  }

  const host = opts.host ?? process.env.HOST ?? "0.0.0.0";
  const port = opts.port ?? (process.env.PORT ? Number(process.env.PORT) : 0);

  return await new Promise<RunningServer>((resolve, reject) => {
    const server = app.listen(port, host, async (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening");
        return reject(err);
      }

      const address = server.address();
      const boundPort =
        typeof address === "object" && address ? address.port : Number(port);
      const boundHost =
        typeof address === "object" && address && address.address !== "::"
          ? address.address
          : host;

      logger.info({ port: boundPort, host: boundHost }, "Server listening");

      if (opts.seedDemoData ?? process.env.ENABLE_DEMO_SEED === "true") {
        try {
          await runSeedIfEmpty();
        } catch (seedErr) {
          logger.error({ err: seedErr }, "Seed failed");
        }
      }

      // Background revalidate the licence every 6h.
      try {
        startLicenseRevalidator();
      } catch (revErr) {
        logger.warn({ err: revErr }, "Failed to start licence revalidator");
      }

      // Nightly OneDrive backup scheduler — only does work if the user has
      // configured a refresh token via Settings → Backup.
      try {
        startBackupScheduler();
      } catch (bErr) {
        logger.warn({ err: bErr }, "Failed to start backup scheduler");
      }

      resolve({
        server,
        port: boundPort,
        host: boundHost,
        url: `http://${boundHost === "0.0.0.0" ? "127.0.0.1" : boundHost}:${boundPort}`,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((closeErr) => (closeErr ? rej(closeErr) : res())),
          ),
      });
    });
  });
}
