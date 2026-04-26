import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  activateLicense,
  getLicenseStatus,
  isAllowed,
  type LicenseStatusResponse,
} from "../lib/license";
import { logger } from "../lib/logger";

const router: ReturnType<typeof Router> = Router();

const DEFAULT_LICENSE_SERVER = process.env.LICENSE_SERVER_URL ?? "";

router.get("/license/status", async (_req: Request, res: Response) => {
  try {
    const status = await getLicenseStatus();
    res.json(status);
  } catch (err) {
    // Never let a DB / filesystem hiccup turn into a 500 here — that would
    // strand the user on the "Licence check failed" screen with no way to
    // enter a key. Log the real cause and respond as if the licence has not
    // yet been activated, so the frontend renders the activation form.
    logger.error({ err }, "license/status read failed; reporting never_activated");
    res.json({
      activated: false,
      status: "never_activated",
      expiresAt: null,
      customerName: null,
      lastValidatedAt: null,
      serverReachable: false,
      graceRemainingDays: null,
    } satisfies LicenseStatusResponse);
  }
});

const activateSchema = z.object({
  key: z.string().trim().min(1),
  serverUrl: z.string().url().optional(),
  fingerprint: z.string().optional(),
});

router.post("/license/activate", async (req: Request, res: Response) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  const serverUrl = parsed.data.serverUrl ?? DEFAULT_LICENSE_SERVER;
  if (!serverUrl) {
    res.status(400).json({
      error:
        "No licence server URL configured. Set LICENSE_SERVER_URL or include serverUrl in the request.",
    });
    return;
  }
  try {
    const result = await activateLicense({
      serverUrl,
      key: parsed.data.key,
      fingerprint: parsed.data.fingerprint,
    });
    if (!result) {
      res.status(502).json({ error: "Could not reach licence server", serverUrl });
      return;
    }
    if (!result.valid) {
      res.status(403).json({ error: "Licence is not valid", status: result.status });
      return;
    }
    const status = await getLicenseStatus();
    res.json({ activated: true, license: status });
  } catch (err) {
    // Without this catch any DB / migration / disk failure becomes a bare
    // 500 with no body, leaving the user staring at "Request failed (500)"
    // and us with no clue. Log the underlying cause and surface a short
    // human-readable message so the activation screen can show it.
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, serverUrl }, "license/activate failed");
    res.status(500).json({
      error: `Activation failed on this PC: ${message}`,
      hint:
        "This usually means the local database couldn't be opened or initialised. " +
        "See %APPDATA%\\FacilityTrack\\logs\\main.log for details.",
    });
  }
});

export const licenseRouter = router;

/**
 * Express middleware that blocks requests when the licence is not in an
 * allowed state. Mounted *after* `/api/license/*` so activation always works.
 */
export async function requireValidLicense(
  _req: Request,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  const status: LicenseStatusResponse = await getLicenseStatus();
  if (isAllowed(status.status)) {
    next();
    return;
  }
  res.status(402).json({
    error: "Licence required",
    license: status,
  });
}
