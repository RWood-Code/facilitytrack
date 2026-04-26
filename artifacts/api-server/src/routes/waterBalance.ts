import { Router } from "express";
import { db } from "@workspace/db";
import { waterBalanceTestsTable, poolsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.get("/water-balance-tests", async (req, res) => {
  const poolId = req.query.poolId ? Number(req.query.poolId) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  const conditions = [];
  if (poolId) conditions.push(eq(waterBalanceTestsTable.poolId, poolId));

  const rows = await db
    .select({
      id: waterBalanceTestsTable.id,
      poolId: waterBalanceTestsTable.poolId,
      poolName: poolsTable.name,
      testedBy: waterBalanceTestsTable.testedBy,
      testedAt: waterBalanceTestsTable.testedAt,
      ph: waterBalanceTestsTable.ph,
      totalAlkalinity: waterBalanceTestsTable.totalAlkalinity,
      calciumHardness: waterBalanceTestsTable.calciumHardness,
      cyanuricAcid: waterBalanceTestsTable.cyanuricAcid,
      totalDissolvedSolids: waterBalanceTestsTable.totalDissolvedSolids,
      langelier: waterBalanceTestsTable.langelier,
      notes: waterBalanceTestsTable.notes,
      createdAt: waterBalanceTestsTable.createdAt,
    })
    .from(waterBalanceTestsTable)
    .leftJoin(poolsTable, eq(waterBalanceTestsTable.poolId, poolsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(waterBalanceTestsTable.testedAt))
    .limit(limit);
  res.json(rows);
});

router.post("/water-balance-tests", async (req, res) => {
  const { poolId, testedBy, testedAt, ph, totalAlkalinity, calciumHardness, cyanuricAcid, totalDissolvedSolids, langelier, notes } = req.body;
  if (!poolId) return res.status(400).json({ error: "poolId required" });

  const [row] = await db.insert(waterBalanceTestsTable).values({
    poolId, testedBy, testedAt: testedAt ? new Date(testedAt) : new Date(), ph, totalAlkalinity, calciumHardness, cyanuricAcid, totalDissolvedSolids, langelier, notes,
  }).returning();
  res.status(201).json(row);
});

router.get("/water-balance-tests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({ id: waterBalanceTestsTable.id, poolId: waterBalanceTestsTable.poolId, poolName: poolsTable.name, testedBy: waterBalanceTestsTable.testedBy, testedAt: waterBalanceTestsTable.testedAt, ph: waterBalanceTestsTable.ph, totalAlkalinity: waterBalanceTestsTable.totalAlkalinity, calciumHardness: waterBalanceTestsTable.calciumHardness, cyanuricAcid: waterBalanceTestsTable.cyanuricAcid, totalDissolvedSolids: waterBalanceTestsTable.totalDissolvedSolids, langelier: waterBalanceTestsTable.langelier, notes: waterBalanceTestsTable.notes, createdAt: waterBalanceTestsTable.createdAt })
    .from(waterBalanceTestsTable)
    .leftJoin(poolsTable, eq(waterBalanceTestsTable.poolId, poolsTable.id))
    .where(eq(waterBalanceTestsTable.id, id))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/water-balance-tests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["ph", "totalAlkalinity", "calciumHardness", "cyanuricAcid", "totalDissolvedSolids", "langelier", "notes"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [row] = await db.update(waterBalanceTestsTable).set(updates as never).where(eq(waterBalanceTestsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/water-balance-tests/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(waterBalanceTestsTable).where(eq(waterBalanceTestsTable.id, id));
  res.status(204).send();
});

export default router;
