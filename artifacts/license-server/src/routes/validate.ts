import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getLicenseDb, licensesTable, validationsTable } from "../lib/db";
import { normalizeLicenseKey } from "../lib/keys";
import { logger } from "../lib/logger";

export const validateRouter = Router();

const validateSchema = z.object({
  key: z.string().min(1),
  machineFingerprint: z.string().optional(),
});

validateRouter.post("/validate", async (req: Request, res: Response) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ valid: false, status: "invalid_request" });
    return;
  }
  const { db, raw } = getLicenseDb();
  const key = normalizeLicenseKey(parsed.data.key);
  const ip = (req.ip ?? "").toString().slice(0, 45);

  const rows = await db.select().from(licensesTable).where(eq(licensesTable.key, key));
  const license = rows[0];

  let result: "active" | "revoked" | "expired" | "unknown";
  if (!license) {
    result = "unknown";
  } else if (license.status === "revoked") {
    result = "revoked";
  } else if (license.expiresAt.getTime() < Date.now()) {
    result = "expired";
  } else {
    result = "active";
  }

  // Best-effort log.
  try {
    raw
      .prepare(
        `INSERT INTO validations (license_key, machine_fingerprint, result, ip_address, validated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(key, parsed.data.machineFingerprint ?? null, result, ip || null, Date.now());
  } catch (err) {
    logger.warn({ err }, "Failed to log validation");
  }

  if (result === "active") {
    res.json({
      valid: true,
      status: result,
      expiresAt: license!.expiresAt.toISOString(),
      customerName: license!.customerName,
    });
  } else {
    res.status(license ? 403 : 404).json({ valid: false, status: result });
  }
});
