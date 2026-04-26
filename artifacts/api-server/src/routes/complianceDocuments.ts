import { Router } from "express";
import { db } from "@workspace/db";
import { complianceDocumentsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

function docStatus(expiryDate: Date | null | undefined): "current" | "expiring_soon" | "expired" {
  if (!expiryDate) return "current";
  const now = new Date();
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return "expired";
  if (expiryDate < sixtyDays) return "expiring_soon";
  return "current";
}

router.get("/compliance-documents", async (req, res) => {
  const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
  const documentType = req.query.documentType as string | undefined;

  const conditions = [];
  if (facilityId) conditions.push(eq(complianceDocumentsTable.facilityId, facilityId));
  if (documentType) conditions.push(eq(complianceDocumentsTable.documentType, documentType));

  const rows = await db
    .select()
    .from(complianceDocumentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(complianceDocumentsTable.documentType);

  res.json(rows.map(r => ({ ...r, status: docStatus(r.expiryDate) })));
});

router.get("/compliance-documents/expiring", async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 60;
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(complianceDocumentsTable)
    .where(lt(complianceDocumentsTable.expiryDate, cutoff))
    .orderBy(complianceDocumentsTable.expiryDate);

  res.json(rows.map(r => ({ ...r, status: docStatus(r.expiryDate) })));
});

router.post("/compliance-documents", requireRole("superuser", "admin"), async (req, res) => {
  const { facilityId, documentType, documentName, description, issuedDate, expiryDate, issuedBy, referenceNumber, documentUrl, notes } = req.body;
  if (!documentType || !documentName) return res.status(400).json({ error: "documentType and documentName are required" });

  const [row] = await db.insert(complianceDocumentsTable).values({
    facilityId,
    documentType,
    documentName,
    description,
    issuedDate: issuedDate ? new Date(issuedDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    issuedBy,
    referenceNumber,
    documentUrl,
    notes,
    status: "current",
  }).returning();

  res.status(201).json({ ...row, status: docStatus(row.expiryDate) });
});

router.get("/compliance-documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(complianceDocumentsTable).where(eq(complianceDocumentsTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ ...rows[0], status: docStatus(rows[0].expiryDate) });
});

router.patch("/compliance-documents/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["documentType", "documentName", "description", "issuedBy", "referenceNumber", "documentUrl", "notes", "status"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.issuedDate !== undefined) updates.issuedDate = req.body.issuedDate ? new Date(req.body.issuedDate) : null;
  if (req.body.expiryDate !== undefined) updates.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  updates.updatedAt = new Date();

  const [row] = await db.update(complianceDocumentsTable).set(updates as never).where(eq(complianceDocumentsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, status: docStatus(row.expiryDate) });
});

router.delete("/compliance-documents/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(complianceDocumentsTable).where(eq(complianceDocumentsTable.id, id));
  res.status(204).send();
});

export default router;
