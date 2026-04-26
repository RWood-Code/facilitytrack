import express, { type Request, type Response } from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { requireAdminAuth } from "./lib/auth";
import { validateRouter } from "./routes/validate";
import { adminApiRouter } from "./routes/admin";
import { renderAdminPage } from "./views/admin";
import { getLicenseDb } from "./lib/db";

export function createApp(basePath: string = process.env.BASE_PATH ?? "") {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  // Public + admin routes are mounted on the configured base path so the
  // service can sit behind the Replit path-based proxy.
  const router = express.Router();

  router.get("/api/health", (_req: Request, res: Response) => {
    try {
      getLicenseDb().raw.prepare("SELECT 1").get();
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, "Health check failed");
      res.status(503).json({ status: "error" });
    }
  });

  router.use("/api", validateRouter); // POST /api/validate (public)

  router.use("/api/admin", requireAdminAuth, adminApiRouter);

  router.get("/admin", requireAdminAuth, (_req: Request, res: Response) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(renderAdminPage(basePath));
  });

  router.get("/", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      `<!doctype html><meta charset="utf-8"><title>FacilityTrack Licence Server</title>` +
        `<body style="font-family:sans-serif;padding:32px;max-width:640px;line-height:1.5">` +
        `<h1>FacilityTrack Licence Server</h1>` +
        `<p>This service issues and validates FacilityTrack desktop licences.</p>` +
        `<ul>` +
        `<li><a href="${basePath}/admin">Admin console</a> (password protected)</li>` +
        `<li><code>POST ${basePath}/api/validate</code> &mdash; client validation endpoint</li>` +
        `<li><code>GET ${basePath}/api/health</code> &mdash; health check</li>` +
        `</ul></body>`,
    );
  });

  if (basePath) {
    app.use(basePath, router);
  } else {
    app.use(router);
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  return app;
}
