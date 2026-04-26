import { createApp } from "./app";
import { logger } from "./lib/logger";
import { ensureLicenseSchema } from "./lib/db";
import { getAdminPassword } from "./lib/auth";

const port = Number(process.env.PORT ?? 8082);
const host = process.env.HOST ?? "0.0.0.0";
const basePath = process.env.BASE_PATH ?? "";

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

async function main(): Promise<void> {
  // Eagerly create tables and verify the DB connection so any
  // migration/permission errors surface at boot, not at first request.
  await ensureLicenseSchema();

  // Eagerly validate admin password configuration so a misconfigured
  // production deployment (missing/weak `LICENSE_ADMIN_PASSWORD`) fails
  // fast at startup instead of only when /admin is first hit.
  getAdminPassword();

  const app = createApp(basePath);
  app.listen(port, host, () => {
    logger.info({ port, host, basePath }, "Licence server listening");
    if (!process.env.LICENSE_ADMIN_PASSWORD) {
      logger.warn("LICENSE_ADMIN_PASSWORD not set — using default 'admin' (dev only)");
    }
  });
}

main().catch((err) => {
  // Use console.error in addition to pino so the message is flushed
  // synchronously before exit — pino's worker transport can drop the
  // last log line on immediate exit, hiding startup failures (e.g.
  // missing LICENSE_ADMIN_PASSWORD or DATABASE_URL) from deployment logs.
  console.error("[licence-server] fatal startup error:", err);
  logger.error({ err }, "Licence server failed to start");
  setTimeout(() => process.exit(1), 100);
});
