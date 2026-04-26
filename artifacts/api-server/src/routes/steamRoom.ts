import { Router } from "express";
import { db } from "@workspace/db";
import { steamRoomChecksTable, poolsTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/steam-room-checks", async (req, res) => {
  const poolId = req.query.poolId ? Number(req.query.poolId) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : null;

  const conditions = [];
  if (poolId) conditions.push(eq(steamRoomChecksTable.poolId, poolId));
  if (dateFrom) conditions.push(gte(steamRoomChecksTable.checkedAt, dateFrom));
  if (dateTo) conditions.push(lte(steamRoomChecksTable.checkedAt, dateTo));

  const rows = await db
    .select({ id: steamRoomChecksTable.id, poolId: steamRoomChecksTable.poolId, poolName: poolsTable.name, checkedBy: steamRoomChecksTable.checkedBy, checkedAt: steamRoomChecksTable.checkedAt, temperature: steamRoomChecksTable.temperature, humidity: steamRoomChecksTable.humidity, isClean: steamRoomChecksTable.isClean, isOperational: steamRoomChecksTable.isOperational, entryType: steamRoomChecksTable.entryType, notes: steamRoomChecksTable.notes, createdAt: steamRoomChecksTable.createdAt })
    .from(steamRoomChecksTable)
    .leftJoin(poolsTable, eq(steamRoomChecksTable.poolId, poolsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(steamRoomChecksTable.checkedAt))
    .limit(limit);
  res.json(rows);
});

router.post("/steam-room-checks", async (req, res) => {
  const { poolId, checkedBy, checkedAt, temperature, humidity, isClean, isOperational, entryType, notes } = req.body;
  if (!poolId || !entryType) return res.status(400).json({ error: "poolId and entryType required" });
  const [row] = await db.insert(steamRoomChecksTable).values({ poolId, checkedBy, checkedAt: checkedAt ? new Date(checkedAt) : new Date(), temperature, humidity, isClean, isOperational, entryType, notes }).returning();
  res.status(201).json(row);
});

router.get("/steam-room-checks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({ id: steamRoomChecksTable.id, poolId: steamRoomChecksTable.poolId, poolName: poolsTable.name, checkedBy: steamRoomChecksTable.checkedBy, checkedAt: steamRoomChecksTable.checkedAt, temperature: steamRoomChecksTable.temperature, humidity: steamRoomChecksTable.humidity, isClean: steamRoomChecksTable.isClean, isOperational: steamRoomChecksTable.isOperational, entryType: steamRoomChecksTable.entryType, notes: steamRoomChecksTable.notes, createdAt: steamRoomChecksTable.createdAt })
    .from(steamRoomChecksTable)
    .leftJoin(poolsTable, eq(steamRoomChecksTable.poolId, poolsTable.id))
    .where(eq(steamRoomChecksTable.id, id))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/steam-room-checks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["temperature", "humidity", "isClean", "isOperational", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [row] = await db.update(steamRoomChecksTable).set(updates as never).where(eq(steamRoomChecksTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/steam-room-checks/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(steamRoomChecksTable).where(eq(steamRoomChecksTable.id, id));
  res.status(204).send();
});

export default router;
