import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

async function checkDatabase(): Promise<{ status: "ok" | "error"; latencyMs?: number; error?: string }> {
  try {
    const { getDb, getRawSqlite } = await import("@workspace/db");
    const start = Date.now();
    getDb();
    const sqlite = getRawSqlite();
    if (!sqlite) {
      return { status: "error", error: "Database not initialised" };
    }
    const result = sqlite.prepare("SELECT 1 as ok").get() as { ok: number } | undefined;
    if (!result || result.ok !== 1) {
      return { status: "error", error: "Database probe returned unexpected result" };
    }
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      error: "Database connection failed",
    };
  }
}

async function healthHandler(_req: Request, res: Response): Promise<void> {
  const db = await checkDatabase();
  const overallStatus = db.status === "ok" ? "ok" : "degraded";
  const httpStatus = overallStatus === "ok" ? 200 : 503;

  res.status(httpStatus).json({
    status: overallStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database: db,
    },
  });
}

router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
