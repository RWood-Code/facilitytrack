import { Router } from "express";
import { db } from "@workspace/db";
import { staffTable, staffQualificationsTable, trainingRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

function qualStatus(expiryDate: Date | null): "current" | "expiring_soon" | "expired" {
  if (!expiryDate) return "current";
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return "expired";
  if (expiryDate < thirtyDays) return "expiring_soon";
  return "current";
}

// Staff
router.get("/staff", async (req, res) => {
  const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : null;

  const conditions = [];
  if (facilityId) conditions.push(eq(staffTable.facilityId, facilityId));
  if (isActive !== null) conditions.push(eq(staffTable.isActive, isActive));

  const rows = await db.select().from(staffTable).where(conditions.length ? and(...conditions) : undefined).orderBy(staffTable.lastName);
  res.json(rows);
});

router.post("/staff", requireRole("superuser", "admin"), async (req, res) => {
  const { firstName, lastName, email, phone, role, facilityId, isActive, startDate, notes } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });
  const [row] = await db.insert(staffTable).values({ firstName, lastName, email, phone, role, facilityId, isActive: isActive ?? true, startDate: startDate ? new Date(startDate) : undefined, notes }).returning();
  res.status(201).json(row);
});

router.get("/staff/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(staffTable).where(eq(staffTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/staff/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["firstName", "lastName", "email", "phone", "role", "isActive", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.startDate !== undefined) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  updates.updatedAt = new Date();
  const [row] = await db.update(staffTable).set(updates as never).where(eq(staffTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/staff/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.status(204).send();
});

// Staff Qualifications
router.get("/staff-qualifications", async (req, res) => {
  const staffId = req.query.staffId ? Number(req.query.staffId) : null;

  const conditions = [];
  if (staffId) conditions.push(eq(staffQualificationsTable.staffId, staffId));

  const rows = await db
    .select({ id: staffQualificationsTable.id, staffId: staffQualificationsTable.staffId, staffName: staffTable.firstName, qualificationName: staffQualificationsTable.qualificationName, issuer: staffQualificationsTable.issuer, issuedDate: staffQualificationsTable.issuedDate, expiryDate: staffQualificationsTable.expiryDate, certificateNumber: staffQualificationsTable.certificateNumber, notes: staffQualificationsTable.notes, createdAt: staffQualificationsTable.createdAt })
    .from(staffQualificationsTable)
    .leftJoin(staffTable, eq(staffQualificationsTable.staffId, staffTable.id))
    .where(conditions.length ? and(...conditions) : undefined);

  const withStatus = rows.map(r => ({ ...r, status: qualStatus(r.expiryDate) }));
  res.json(withStatus);
});

router.post("/staff-qualifications", requireRole("superuser", "admin"), async (req, res) => {
  const { staffId, qualificationName, issuer, issuedDate, expiryDate, certificateNumber, notes } = req.body;
  if (!staffId || !qualificationName) return res.status(400).json({ error: "staffId and qualificationName required" });
  const [row] = await db.insert(staffQualificationsTable).values({ staffId, qualificationName, issuer, issuedDate: issuedDate ? new Date(issuedDate) : undefined, expiryDate: expiryDate ? new Date(expiryDate) : undefined, certificateNumber, notes }).returning();
  const withStatus = { ...row, status: qualStatus(row.expiryDate) };
  res.status(201).json(withStatus);
});

router.get("/staff-qualifications/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(staffQualificationsTable).where(eq(staffQualificationsTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ ...rows[0], status: qualStatus(rows[0].expiryDate) });
});

router.patch("/staff-qualifications/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["qualificationName", "issuer", "certificateNumber", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.issuedDate !== undefined) updates.issuedDate = req.body.issuedDate ? new Date(req.body.issuedDate) : null;
  if (req.body.expiryDate !== undefined) updates.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  const [row] = await db.update(staffQualificationsTable).set(updates as never).where(eq(staffQualificationsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, status: qualStatus(row.expiryDate) });
});

router.delete("/staff-qualifications/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(staffQualificationsTable).where(eq(staffQualificationsTable.id, id));
  res.status(204).send();
});

// Training Records
router.get("/training-records", async (req, res) => {
  const staffId = req.query.staffId ? Number(req.query.staffId) : null;
  const conditions = [];
  if (staffId) conditions.push(eq(trainingRecordsTable.staffId, staffId));

  const rows = await db
    .select({ id: trainingRecordsTable.id, staffId: trainingRecordsTable.staffId, staffName: staffTable.firstName, trainingName: trainingRecordsTable.trainingName, completedAt: trainingRecordsTable.completedAt, provider: trainingRecordsTable.provider, durationHours: trainingRecordsTable.durationHours, notes: trainingRecordsTable.notes, createdAt: trainingRecordsTable.createdAt })
    .from(trainingRecordsTable)
    .leftJoin(staffTable, eq(trainingRecordsTable.staffId, staffTable.id))
    .where(conditions.length ? and(...conditions) : undefined);
  res.json(rows);
});

router.post("/training-records", requireRole("superuser", "admin"), async (req, res) => {
  const { staffId, trainingName, completedAt, provider, durationHours, notes } = req.body;
  if (!staffId || !trainingName) return res.status(400).json({ error: "staffId and trainingName required" });
  const [row] = await db.insert(trainingRecordsTable).values({ staffId, trainingName, completedAt: completedAt ? new Date(completedAt) : undefined, provider, durationHours, notes }).returning();
  res.status(201).json(row);
});

router.get("/training-records/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(trainingRecordsTable).where(eq(trainingRecordsTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/training-records/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["trainingName", "provider", "durationHours", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.completedAt !== undefined) updates.completedAt = req.body.completedAt ? new Date(req.body.completedAt) : null;
  const [row] = await db.update(trainingRecordsTable).set(updates as never).where(eq(trainingRecordsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/training-records/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(trainingRecordsTable).where(eq(trainingRecordsTable.id, id));
  res.status(204).send();
});

export default router;
