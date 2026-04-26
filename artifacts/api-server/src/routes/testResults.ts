import { Router } from "express";
import { db } from "@workspace/db";
import { testResultsTable, poolsTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { computeComplianceResult } from "../lib/compliance";

const router = Router();

router.get("/test-results", async (req, res) => {
  const poolId = req.query.poolId ? Number(req.query.poolId) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const isCompliant = req.query.isCompliant !== undefined ? req.query.isCompliant === "true" : null;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : null;

  const conditions = [];
  if (poolId) conditions.push(eq(testResultsTable.poolId, poolId));
  if (isCompliant !== null) conditions.push(eq(testResultsTable.isCompliant, isCompliant));
  if (dateFrom) conditions.push(gte(testResultsTable.testedAt, dateFrom));
  if (dateTo) conditions.push(lte(testResultsTable.testedAt, dateTo));

  const rows = await db
    .select({
      id: testResultsTable.id,
      poolId: testResultsTable.poolId,
      poolName: poolsTable.name,
      testedBy: testResultsTable.testedBy,
      testedAt: testResultsTable.testedAt,
      freeChlorine: testResultsTable.freeChlorine,
      totalAvailableChlorine: testResultsTable.totalAvailableChlorine,
      combinedChlorine: testResultsTable.combinedChlorine,
      ph: testResultsTable.ph,
      temperature: testResultsTable.temperature,
      turbidity: testResultsTable.turbidity,
      totalAlkalinity: testResultsTable.totalAlkalinity,
      isCompliant: testResultsTable.isCompliant,
      notes: testResultsTable.notes,
      createdAt: testResultsTable.createdAt,
    })
    .from(testResultsTable)
    .leftJoin(poolsTable, eq(testResultsTable.poolId, poolsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(testResultsTable.testedAt))
    .limit(limit);
  res.json(rows);
});

router.post("/test-results", async (req, res) => {
  const { poolId, testedBy, testedAt, freeChlorine, totalAvailableChlorine, combinedChlorine, ph, temperature, turbidity, totalAlkalinity, notes } = req.body;
  if (!poolId) return res.status(400).json({ error: "poolId required" });

  const pools = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  const pool = pools[0];
  if (!pool) return res.status(404).json({ error: "Pool not found" });

  const complianceResult = computeComplianceResult({
    poolType: pool.poolType,
    freeChlorine,
    totalAvailableChlorine,
    combinedChlorine,
    ph,
    temperature,
    turbidity,
    customFreeChlorineMin: pool.customFreeChlorineMin,
    customFreeChlorineMax: pool.customFreeChlorineMax,
    customPhMin: pool.customPhMin,
    customPhMax: pool.customPhMax,
    customTempMin: pool.customTempMin,
    customTempMax: pool.customTempMax,
    customTurbidityMax: pool.customTurbidityMax,
    customCombinedChlorineMax: pool.customCombinedChlorineMax,
  });

  const persistedCac = combinedChlorine ?? complianceResult.combinedChlorine;

  const [row] = await db.insert(testResultsTable).values({
    poolId, testedBy, testedAt: testedAt ? new Date(testedAt) : new Date(),
    freeChlorine, totalAvailableChlorine, combinedChlorine: persistedCac,
    ph, temperature, turbidity, totalAlkalinity,
    isCompliant: complianceResult.isCompliant, notes,
  }).returning();

  const withPool = { ...row, poolName: pool.name };
  res.status(201).json(withPool);
});

router.get("/test-results/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({
      id: testResultsTable.id,
      poolId: testResultsTable.poolId,
      poolName: poolsTable.name,
      testedBy: testResultsTable.testedBy,
      testedAt: testResultsTable.testedAt,
      freeChlorine: testResultsTable.freeChlorine,
      totalAvailableChlorine: testResultsTable.totalAvailableChlorine,
      combinedChlorine: testResultsTable.combinedChlorine,
      ph: testResultsTable.ph,
      temperature: testResultsTable.temperature,
      turbidity: testResultsTable.turbidity,
      totalAlkalinity: testResultsTable.totalAlkalinity,
      isCompliant: testResultsTable.isCompliant,
      notes: testResultsTable.notes,
      createdAt: testResultsTable.createdAt,
    })
    .from(testResultsTable)
    .leftJoin(poolsTable, eq(testResultsTable.poolId, poolsTable.id))
    .where(eq(testResultsTable.id, id))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/test-results/:id", async (req, res) => {
  const id = Number(req.params.id);

  const existing = await db.select().from(testResultsTable).where(eq(testResultsTable.id, id)).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  const pools = await db.select().from(poolsTable).where(eq(poolsTable.id, existing[0].poolId)).limit(1);
  const pool = pools[0];

  const fields = ["freeChlorine", "totalAvailableChlorine", "combinedChlorine", "ph", "temperature", "turbidity", "totalAlkalinity", "notes"];
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const merged = { ...existing[0], ...updates };
  if (pool && Object.keys(updates).some(k => ["freeChlorine", "totalAvailableChlorine", "combinedChlorine", "ph", "temperature", "turbidity"].includes(k))) {
    const patchResult = computeComplianceResult({
      poolType: pool.poolType,
      freeChlorine: merged.freeChlorine,
      totalAvailableChlorine: merged.totalAvailableChlorine,
      combinedChlorine: merged.combinedChlorine,
      ph: merged.ph,
      temperature: merged.temperature,
      turbidity: merged.turbidity,
      customFreeChlorineMin: pool.customFreeChlorineMin,
      customFreeChlorineMax: pool.customFreeChlorineMax,
      customPhMin: pool.customPhMin,
      customPhMax: pool.customPhMax,
      customTempMin: pool.customTempMin,
      customTempMax: pool.customTempMax,
      customTurbidityMax: pool.customTurbidityMax,
      customCombinedChlorineMax: pool.customCombinedChlorineMax,
    });
    updates.isCompliant = patchResult.isCompliant;
    if (merged.combinedChlorine == null && patchResult.combinedChlorine != null) {
      updates.combinedChlorine = patchResult.combinedChlorine;
    }
  }

  const [row] = await db.update(testResultsTable).set(updates as never).where(eq(testResultsTable.id, id)).returning();
  res.json(row);
});

router.delete("/test-results/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(testResultsTable).where(eq(testResultsTable.id, id));
  res.status(204).send();
});

export default router;
