import { Router } from "express";
import { db } from "@workspace/db";
import { testResultsTable, poolsTable, facilitiesTable, steamRoomChecksTable, workOrdersTable, staffQualificationsTable, poolClosuresTable, notificationsTable } from "@workspace/db";
import { eq, sql, desc, gte, and, lt } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (_req, res) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [testStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      compliant: sql<number>`count(*) filter (where ${testResultsTable.isCompliant} = true)::int`,
    })
    .from(testResultsTable)
    .where(gte(testResultsTable.testedAt, startOfDay));

  const [steamStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(steamRoomChecksTable)
    .where(gte(steamRoomChecksTable.checkedAt, startOfDay));

  const [workOrderStats] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(workOrdersTable)
    .where(eq(workOrdersTable.status, "open"));

  const [poolStats] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(eq(poolsTable.isActive, true));

  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [qualStats] = await db
    .select({ expiring: sql<number>`count(*)::int` })
    .from(staffQualificationsTable)
    .where(and(
      gte(staffQualificationsTable.expiryDate, today),
      lt(staffQualificationsTable.expiryDate, thirtyDays)
    ));

  const tests = testStats ?? { total: 0, compliant: 0 };
  const nonCompliant = (tests.total ?? 0) - (tests.compliant ?? 0);

  res.json({
    testsToday: tests.total ?? 0,
    compliantToday: tests.compliant ?? 0,
    nonCompliantToday: nonCompliant,
    steamChecksToday: steamStats?.total ?? 0,
    openWorkOrders: workOrderStats?.open ?? 0,
    activePoolCount: poolStats?.active ?? 0,
    expiringQualifications: qualStats?.expiring ?? 0,
  });
});

router.get("/dashboard/pool-status", async (_req, res) => {
  const pools = await db
    .select({
      poolId: poolsTable.id,
      poolName: poolsTable.name,
      facilityName: facilitiesTable.name,
      poolType: poolsTable.poolType,
    })
    .from(poolsTable)
    .leftJoin(facilitiesTable, eq(poolsTable.facilityId, facilitiesTable.id))
    .where(eq(poolsTable.isActive, true))
    .orderBy(poolsTable.name);

  const result = await Promise.all(pools.map(async (pool) => {
    const latest = await db
      .select()
      .from(testResultsTable)
      .where(eq(testResultsTable.poolId, pool.poolId))
      .orderBy(desc(testResultsTable.testedAt))
      .limit(1);
    const lr = latest[0];
    return {
      ...pool,
      facilityName: pool.facilityName ?? "",
      isCompliant: lr ? lr.isCompliant : null,
      lastTestedAt: lr ? lr.testedAt : null,
      freeChlorine: lr ? lr.freeChlorine : null,
      ph: lr ? lr.ph : null,
      temperature: lr ? lr.temperature : null,
    };
  }));
  res.json(result);
});

router.get("/dashboard/compliance-trend", async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${testResultsTable.testedAt})::date::text`,
      compliant: sql<number>`count(*) filter (where ${testResultsTable.isCompliant} = true)::int`,
      nonCompliant: sql<number>`count(*) filter (where ${testResultsTable.isCompliant} = false)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(testResultsTable)
    .where(gte(testResultsTable.testedAt, thirtyDaysAgo))
    .groupBy(sql`date_trunc('day', ${testResultsTable.testedAt})::date`)
    .orderBy(sql`date_trunc('day', ${testResultsTable.testedAt})::date`);
  res.json(rows);
});

router.get("/dashboard/recent-activity", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const tests = await db
    .select({ id: testResultsTable.id, entityName: poolsTable.name, isCompliant: testResultsTable.isCompliant, createdAt: testResultsTable.createdAt })
    .from(testResultsTable)
    .leftJoin(poolsTable, eq(testResultsTable.poolId, poolsTable.id))
    .orderBy(desc(testResultsTable.createdAt))
    .limit(limit);

  const workOrders = await db
    .select({ id: workOrdersTable.id, entityName: workOrdersTable.title, status: workOrdersTable.status, createdAt: workOrdersTable.createdAt })
    .from(workOrdersTable)
    .orderBy(desc(workOrdersTable.createdAt))
    .limit(10);

  const closures = await db
    .select({ id: poolClosuresTable.id, entityName: poolsTable.name, reason: poolClosuresTable.reason, createdAt: poolClosuresTable.createdAt })
    .from(poolClosuresTable)
    .leftJoin(poolsTable, eq(poolClosuresTable.poolId, poolsTable.id))
    .orderBy(desc(poolClosuresTable.createdAt))
    .limit(10);

  const items = [
    ...tests.map(t => ({ id: `test-${t.id}`, type: "water_test", description: `Water test recorded for ${t.entityName ?? "pool"}`, entityName: t.entityName, isCompliant: t.isCompliant, createdAt: t.createdAt })),
    ...workOrders.map(w => ({ id: `wo-${w.id}`, type: "work_order", description: `Work order: ${w.entityName}`, entityName: w.entityName, isCompliant: null, createdAt: w.createdAt })),
    ...closures.map(c => ({ id: `closure-${c.id}`, type: "pool_closure", description: `Pool closed: ${c.entityName ?? "pool"} — ${c.reason}`, entityName: c.entityName, isCompliant: null, createdAt: c.createdAt })),
  ];

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items.slice(0, limit));
});

router.get("/dashboard/alerts", async (_req, res) => {
  const alerts: { id: string; type: string; severity: string; message: string; entityName: string | null; entityId: number | null }[] = [];

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const activePools = await db.select().from(poolsTable).where(eq(poolsTable.isActive, true));
  for (const pool of activePools) {
    const latest = await db.select().from(testResultsTable).where(eq(testResultsTable.poolId, pool.id)).orderBy(desc(testResultsTable.testedAt)).limit(1);
    if (!latest[0] || latest[0].testedAt < sevenDaysAgo) {
      alerts.push({ id: `overdue-${pool.id}`, type: "overdue_test", severity: "high", message: `Pool "${pool.name}" has not been tested in the last 7 days`, entityName: pool.name, entityId: pool.id });
    }
  }

  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = await db.select().from(staffQualificationsTable).where(and(gte(staffQualificationsTable.expiryDate, today), lt(staffQualificationsTable.expiryDate, thirtyDays)));
  for (const q of expiring) {
    alerts.push({ id: `qual-${q.id}`, type: "expiring_qualification", severity: "medium", message: `Qualification "${q.qualificationName}" expires soon`, entityName: q.qualificationName, entityId: q.id });
  }

  const openWOs = await db.select().from(workOrdersTable).where(eq(workOrdersTable.status, "open"));
  if (openWOs.length > 0) {
    alerts.push({ id: "open-wos", type: "open_work_order", severity: "low", message: `${openWOs.length} open work order(s) pending`, entityName: null, entityId: null });
  }

  const openClosures = await db.select({ id: poolClosuresTable.id, entityId: poolClosuresTable.poolId, poolName: poolsTable.name }).from(poolClosuresTable).leftJoin(poolsTable, eq(poolClosuresTable.poolId, poolsTable.id)).where(sql`${poolClosuresTable.reopenedAt} is null`);
  for (const c of openClosures) {
    alerts.push({ id: `closure-open-${c.id}`, type: "pool_closure", severity: "high", message: `Pool "${c.poolName ?? "Unknown"}" is currently closed`, entityName: c.poolName, entityId: c.entityId });
  }

  res.json(alerts);
});

export default router;
