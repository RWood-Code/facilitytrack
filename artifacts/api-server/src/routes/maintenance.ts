import { Router } from "express";
import { db } from "@workspace/db";
import { maintenanceSchedulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/maintenance-schedules", async (req, res) => {
  const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
  const status = req.query.status as string | undefined;

  const conditions = [];
  if (facilityId) conditions.push(eq(maintenanceSchedulesTable.facilityId, facilityId));
  if (status) conditions.push(eq(maintenanceSchedulesTable.status, status));

  const rows = await db.select().from(maintenanceSchedulesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(maintenanceSchedulesTable.title);
  res.json(rows);
});

router.post("/maintenance-schedules", requireRole("superuser", "admin"), async (req, res) => {
  const { title, facilityId, assetId, frequency, nextDueAt, assignedTo, notes } = req.body;
  if (!title || !frequency) return res.status(400).json({ error: "title and frequency required" });
  const [row] = await db.insert(maintenanceSchedulesTable).values({ title, facilityId, assetId, frequency, status: "active", nextDueAt: nextDueAt ? new Date(nextDueAt) : undefined, assignedTo, notes }).returning();
  res.status(201).json(row);
});

router.get("/maintenance-schedules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/maintenance-schedules/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["title", "frequency", "status", "assignedTo", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.lastCompletedAt !== undefined) updates.lastCompletedAt = req.body.lastCompletedAt ? new Date(req.body.lastCompletedAt) : null;
  if (req.body.nextDueAt !== undefined) updates.nextDueAt = req.body.nextDueAt ? new Date(req.body.nextDueAt) : null;
  updates.updatedAt = new Date();
  const [row] = await db.update(maintenanceSchedulesTable).set(updates as never).where(eq(maintenanceSchedulesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/maintenance-schedules/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.id, id));
  res.status(204).send();
});

export default router;
