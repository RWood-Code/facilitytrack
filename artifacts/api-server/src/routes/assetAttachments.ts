import { Router } from "express";
import { db } from "@workspace/db";
import { assetAttachmentsTable, assetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
const requireAdmin = requireRole("admin", "superuser");

const router = Router();

router.get("/assets/:id/attachments", async (req, res) => {
  const assetId = Number(req.params.id);
  const rows = await db
    .select()
    .from(assetAttachmentsTable)
    .where(eq(assetAttachmentsTable.assetId, assetId))
    .orderBy(assetAttachmentsTable.createdAt);
  res.json(rows);
});

router.post("/assets/:id/attachments", requireAdmin, async (req, res) => {
  const assetId = Number(req.params.id);
  const assets = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId)).limit(1);
  if (!assets[0]) return res.status(404).json({ error: "Asset not found" });

  const { fileName, fileUrl, fileType, fileSize, uploadedBy } = req.body;
  if (!fileName || !fileUrl) return res.status(400).json({ error: "fileName and fileUrl required" });

  const [row] = await db
    .insert(assetAttachmentsTable)
    .values({ assetId, fileName, fileUrl, fileType, fileSize, uploadedBy })
    .returning();
  res.status(201).json(row);
});

router.delete("/assets/:id/attachments/:attachmentId", requireAdmin, async (req, res) => {
  const assetId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  await db
    .delete(assetAttachmentsTable)
    .where(and(eq(assetAttachmentsTable.id, attachmentId), eq(assetAttachmentsTable.assetId, assetId)));
  res.status(204).send();
});

export default router;
