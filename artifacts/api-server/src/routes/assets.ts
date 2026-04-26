import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/assets", async (req, res) => {
  const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  const conditions = [];
  if (facilityId) conditions.push(eq(assetsTable.facilityId, facilityId));
  if (category) conditions.push(eq(assetsTable.category, category));
  if (status) conditions.push(eq(assetsTable.status, status));

  const rows = await db.select().from(assetsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(assetsTable.name).limit(limit);
  res.json(rows);
});

router.post("/assets", requireRole("superuser", "admin"), async (req, res) => {
  const { name, facilityId, category, status, barcode, serialNumber, manufacturer, model, purchaseDate, lastServiceDate, nextServiceDate, location, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const [row] = await db.insert(assetsTable).values({
    name, facilityId, category, status: status ?? "operational", barcode, serialNumber, manufacturer, model,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
    lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : undefined,
    nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : undefined,
    location, notes,
  }).returning();
  res.status(201).json(row);
});

router.get("/assets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/assets/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["name", "category", "status", "barcode", "serialNumber", "manufacturer", "model", "location", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.purchaseDate !== undefined) updates.purchaseDate = req.body.purchaseDate ? new Date(req.body.purchaseDate) : null;
  if (req.body.lastServiceDate !== undefined) updates.lastServiceDate = req.body.lastServiceDate ? new Date(req.body.lastServiceDate) : null;
  if (req.body.nextServiceDate !== undefined) updates.nextServiceDate = req.body.nextServiceDate ? new Date(req.body.nextServiceDate) : null;
  updates.updatedAt = new Date();
  const [row] = await db.update(assetsTable).set(updates as never).where(eq(assetsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/assets/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(assetsTable).where(eq(assetsTable.id, id));
  res.status(204).send();
});

export default router;
