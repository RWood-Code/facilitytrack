import { Router, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getLicenseDb, licensesTable, validationsTable } from "../lib/db";
import { generateLicenseKey, normalizeLicenseKey } from "../lib/keys";

export const adminApiRouter = Router();

const createSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().optional().or(z.literal("")),
  expiresAt: z.string().min(1), // ISO date or YYYY-MM-DD
  notes: z.string().max(1000).optional(),
});

adminApiRouter.get("/licenses", async (_req: Request, res: Response) => {
  const { db } = getLicenseDb();
  const rows = await db.select().from(licensesTable).orderBy(desc(licensesTable.createdAt));
  res.json(rows);
});

adminApiRouter.post("/licenses", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { db } = getLicenseDb();
  const expiresAt = new Date(parsed.data.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    res.status(400).json({ error: "Invalid expiresAt" });
    return;
  }
  const key = generateLicenseKey();
  const now = new Date();
  const inserted = await db
    .insert(licensesTable)
    .values({
      key,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail || null,
      expiresAt,
      notes: parsed.data.notes ?? null,
      createdAt: now,
      updatedAt: now,
      status: "active",
    })
    .returning();
  res.status(201).json(inserted[0]);
});

const updateSchema = z.object({
  status: z.enum(["active", "revoked"]).optional(),
  expiresAt: z.string().optional(),
  customerName: z.string().min(1).max(200).optional(),
  customerEmail: z.string().email().optional().or(z.literal("")).optional(),
  notes: z.string().max(1000).optional(),
});

adminApiRouter.patch("/licenses/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { db } = getLicenseDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.expiresAt) {
    const d = new Date(parsed.data.expiresAt);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid expiresAt" });
      return;
    }
    patch.expiresAt = d;
  }
  if (parsed.data.customerName) patch.customerName = parsed.data.customerName;
  if (parsed.data.customerEmail !== undefined) {
    patch.customerEmail = parsed.data.customerEmail || null;
  }
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const updated = await db
    .update(licensesTable)
    .set(patch)
    .where(eq(licensesTable.id, id))
    .returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated[0]);
});

adminApiRouter.get("/licenses/:id/validations", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { db } = getLicenseDb();
  const license = await db.select().from(licensesTable).where(eq(licensesTable.id, id));
  if (license.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await db
    .select()
    .from(validationsTable)
    .where(eq(validationsTable.licenseKey, license[0].key))
    .orderBy(desc(validationsTable.validatedAt))
    .limit(50);
  res.json(rows);
});

adminApiRouter.get("/stats", async (_req: Request, res: Response) => {
  const { raw } = getLicenseDb();
  const total = (raw.prepare("SELECT COUNT(*) AS n FROM licenses").get() as { n: number }).n;
  const active = (
    raw.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status='active' AND expires_at > ?").get(Date.now()) as { n: number }
  ).n;
  const revoked = (raw.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status='revoked'").get() as { n: number }).n;
  const expired = (
    raw.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status='active' AND expires_at <= ?").get(Date.now()) as { n: number }
  ).n;
  const validations24h = (
    raw.prepare("SELECT COUNT(*) AS n FROM validations WHERE validated_at > ?").get(Date.now() - 86400000) as { n: number }
  ).n;
  res.json({ total, active, revoked, expired, validations24h });
});
