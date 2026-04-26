import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/notifications", async (req, res) => {
  const isRead = req.query.isRead !== undefined ? req.query.isRead === "true" : null;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  let query = db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(limit).$dynamic();
  if (isRead !== null) query = query.where(eq(notificationsTable.isRead, isRead));
  const rows = await query;
  res.json(rows);
});

router.post("/notifications", async (req, res) => {
  const { title, message, type, relatedEntityType, relatedEntityId } = req.body;
  if (!title || !message || !type) return res.status(400).json({ error: "title, message, type required" });
  const [row] = await db.insert(notificationsTable).values({ title, message, type, relatedEntityType, relatedEntityId }).returning();
  res.status(201).json(row);
});

router.patch("/notifications/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.patch("/notifications/read-all", async (_req, res) => {
  const result = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.isRead, false)).returning();
  res.json({ updated: result.length });
});

export default router;
