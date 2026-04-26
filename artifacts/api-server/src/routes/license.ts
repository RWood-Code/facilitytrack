import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  activateLicense,
  getLicenseStatus,
  isAllowed,
  type LicenseStatusResponse,
} from "../lib/license";

const router: ReturnType<typeof Router> = Router();

const DEFAULT_LICENSE_SERVER = process.env.LICENSE_SERVER_URL ?? "";

router.get("/license/status", async (_req: Request, res: Response) => {
  const status = await getLicenseStatus();
  res.json(status);
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
