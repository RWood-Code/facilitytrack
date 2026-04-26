import { Router } from "express";
import { db } from "@workspace/db";
import { poolClosuresTable, poolsTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/pool-closures", async (req, res) => {
  const poolId = req.query.poolId ? Number(req.query.poolId) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : null;

  const conditions = [];
  if (poolId) conditions.push(eq(poolClosuresTable.poolId, poolId));
  if (dateFrom) conditions.push(gte(poolClosuresTable.closedAt, dateFrom));
  if (dateTo) conditions.push(lte(poolClosuresTable.closedAt, dateTo));

  const rows = await db
    .select({ id: poolClosuresTable.id, poolId: poolClosuresTable.poolId, poolName: poolsTable.name, closedBy: poolClosuresTable.closedBy, closedAt: poolClosuresTable.closedAt, reopenedAt: poolClosuresTable.reopenedAt, closureCode: poolClosuresTable.closureCode, reason: poolClosuresTable.reason, notes: poolClosuresTable.notes, createdAt: poolClosuresTable.createdAt })
    .from(poolClosuresTable)
    .leftJoin(poolsTable, eq(poolClosuresTable.poolId, poolsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(poolClosuresTable.closedAt))
    .limit(limit);
  res.json(rows);
});

router.post("/pool-closures", async (req, res) => {
  const { poolId, closedBy, closedAt, closureCode, reason, notes } = req.body;
  if (!poolId || !reason) return res.status(400).json({ error: "poolId and reason required" });
  const [row] = await db.insert(poolClosuresTable).values({ poolId, closedBy, closedAt: closedAt ? new Date(closedAt) : new Date(), closureCode, reason, notes }).returning();
  res.status(201).json(row);
});

router.get("/pool-closures/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({ id: poolClosuresTable.id, poolId: poolClosuresTable.poolId, poolName: poolsTable.name, closedBy: poolClosuresTable.closedBy, closedAt: poolClosuresTable.closedAt, reopenedAt: poolClosuresTable.reopenedAt, closureCode: poolClosuresTable.closureCode, reason: poolClosuresTable.reason, notes: poolClosuresTable.notes, createdAt: poolClosuresTable.createdAt })
    .from(poolClosuresTable)
    .leftJoin(poolsTable, eq(poolClosuresTable.poolId, poolsTable.id))
    .where(eq(poolClosuresTable.id, id))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/pool-closures/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  if (req.body.closureCode !== undefined) updates.closureCode = req.body.closureCode;
  if (req.body.reason !== undefined) updates.reason = req.body.reason;
  if (req.body.reopenedAt !== undefined) updates.reopenedAt = req.body.reopenedAt ? new Date(req.body.reopenedAt) : null;
  if (req.body.notes !== undefined) updates.notes = req.body.notes;
  const [row] = await db.update(poolClosuresTable).set(updates as never).where(eq(poolClosuresTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/pool-closures/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(poolClosuresTable).where(eq(poolClosuresTable.id, id));
  res.status(204).send();
});

export default router;
