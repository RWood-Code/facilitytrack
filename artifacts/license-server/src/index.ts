import { createApp } from "./app";
import { logger } from "./lib/logger";
import { getLicenseDb } from "./lib/db";
import { getAdminPassword } from "./lib/auth";

const port = Number(process.env.PORT ?? 8082);
const host = process.env.HOST ?? "0.0.0.0";
const basePath = process.env.BASE_PATH ?? "";

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

// Eagerly open the DB so any migration/permission errors surface at boot.
getLicenseDb();

// Eagerly validate admin password configuration so a misconfigured production
// deployment (missing/weak `LICENSE_ADMIN_PASSWORD`) fails fast at startup
// instead of only when /admin is first hit.
getAdminPassword();

const app = createApp(basePath);
app.listen(port, host, () => {
  logger.info({ port, host, basePath }, "Licence server listening");
  if (!process.env.LICENSE_ADMIN_PASSWORD) {
    logger.warn("LICENSE_ADMIN_PASSWORD not set — using default 'admin' (dev only)");
  }
});
