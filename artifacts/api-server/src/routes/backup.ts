import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  configureBackup,
  createOneDriveFolder,
  disableBackup,
  getPublicBackupState,
  listOneDriveFolders,
  runBackupNow,
  updateBackupSchedule,
} from "../lib/backup";
import { requireRole } from "../middleware/auth";

const router: ReturnType<typeof Router> = Router();

router.get("/backup/status", async (_req: Request, res: Response) => {
  res.json(await getPublicBackupState());
});

const configureSchema = z.object({
  clientId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1).optional(),
  refreshToken: z.string().trim().min(1),
  targetFolder: z.string().trim().min(1).optional(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
});

router.post(
  "/backup/configure",
  requireRole("superuser", "admin"),
  async (req: Request, res: Response) => {
    const parsed = configureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    await configureBackup(parsed.data);
    res.json(await getPublicBackupState());
  },
);

const scheduleSchema = z.object({
  targetFolder: z.string().trim().min(1).optional(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
});

router.post(
  "/backup/schedule",
  requireRole("superuser", "admin"),
  async (req: Request, res: Response) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    await updateBackupSchedule(parsed.data);
    res.json(await getPublicBackupState());
  },
);

router.post(
  "/backup/disable",
  requireRole("superuser", "admin"),
  async (_req: Request, res: Response) => {
    await disableBackup();
    res.json(await getPublicBackupState());
  },
);

router.post(
  "/backup/run",
  requireRole("superuser", "admin"),
  async (_req: Request, res: Response) => {
    const result = await runBackupNow();
    const state = await getPublicBackupState();
    if (result.ok) {
      res.json({ ok: true, state });
    } else {
      res.status(502).json({ ok: false, error: result.error, state });
    }
  },
);

// ---------------------------------------------------------------------------
// OneDrive folder picker — proxy endpoints.
//
// The renderer must never see the Microsoft Graph access token (which would
// give it full Files.ReadWrite over the user's OneDrive). The api-server,
// which already has the refresh token, mints short-lived access tokens
// itself and forwards only the listing/creation result to the browser.
// ---------------------------------------------------------------------------

const foldersListSchema = z.object({
  // Optional: empty/undefined means "list the drive root".
  path: z.string().trim().max(1024).optional(),
});

router.get(
  "/backup/folders",
  requireRole("superuser", "admin"),
  async (req: Request, res: Response) => {
    const parsed = foldersListSchema.safeParse({
      path: typeof req.query.path === "string" ? req.query.path : undefined,
    });
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    try {
      const listing = await listOneDriveFolders(parsed.data.path);
      res.json(listing);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  },
);

const createFolderSchema = z.object({
  parentPath: z.string().trim().max(1024).optional(),
  name: z.string().trim().min(1).max(255),
});

router.post(
  "/backup/folders",
  requireRole("superuser", "admin"),
  async (req: Request, res: Response) => {
    const parsed = createFolderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    try {
      const created = await createOneDriveFolder(
        parsed.data.parentPath,
        parsed.data.name,
      );
      res.json(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface "already exists" as 409 so the UI can show a tidy message.
      const status = /already exists/i.test(message) ? 409 : 502;
      res.status(status).json({ error: message });
    }
  },
);

export default router;
