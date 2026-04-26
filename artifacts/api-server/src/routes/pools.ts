import { Router } from "express";
import { db } from "@workspace/db";
import { poolsTable, facilitiesTable, appUsersTable } from "@workspace/db";
import { alias } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import { diffChanges, recordAuditLog } from "../lib/audit";

const router = Router();

const updaterUsers = alias(appUsersTable, "updater_users");
const creatorUsers = alias(appUsersTable, "creator_users");

const baseSelect = {
  id: poolsTable.id,
  name: poolsTable.name,
  facilityId: poolsTable.facilityId,
  facilityName: facilitiesTable.name,
  poolType: poolsTable.poolType,
  isActive: poolsTable.isActive,
  volumeLitres: poolsTable.volumeLitres,
  customPhMin: poolsTable.customPhMin,
  customPhMax: poolsTable.customPhMax,
  customFreeChlorineMin: poolsTable.customFreeChlorineMin,
  customFreeChlorineMax: poolsTable.customFreeChlorineMax,
  customTempMin: poolsTable.customTempMin,
  customTempMax: poolsTable.customTempMax,
  customTurbidityMax: poolsTable.customTurbidityMax,
  customCombinedChlorineMax: poolsTable.customCombinedChlorineMax,
  notes: poolsTable.notes,
  createdAt: poolsTable.createdAt,
  createdBy: poolsTable.createdBy,
  createdByFirstName: creatorUsers.firstName,
  createdByLastName: creatorUsers.lastName,
  updatedAt: poolsTable.updatedAt,
  updatedBy: poolsTable.updatedBy,
  updatedByFirstName: updaterUsers.firstName,
  updatedByLastName: updaterUsers.lastName,
} as const;

function mapRow<T extends {
  updatedByFirstName: string | null;
  updatedByLastName: string | null;
  createdByFirstName: string | null;
  createdByLastName: string | null;
}>(r: T) {
  const { updatedByFirstName, updatedByLastName, createdByFirstName, createdByLastName, ...rest } = r;
  const updatedByName = updatedByFirstName
    ? `${updatedByFirstName}${updatedByLastName ? " " + updatedByLastName : ""}`
    : null;
  const createdByName = createdByFirstName
    ? `${createdByFirstName}${createdByLastName ? " " + createdByLastName : ""}`
    : null;
  return { ...rest, createdByName, updatedByName };
}

router.get("/pools", async (req, res) => {
  const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
  let query = db
    .select(baseSelect)
    .from(poolsTable)
    .leftJoin(facilitiesTable, eq(poolsTable.facilityId, facilitiesTable.id))
    .leftJoin(updaterUsers, eq(poolsTable.updatedBy, updaterUsers.id))
    .leftJoin(creatorUsers, eq(poolsTable.createdBy, creatorUsers.id))
    .$dynamic();
  if (facilityId) query = query.where(eq(poolsTable.facilityId, facilityId));
  const rows = await query.orderBy(poolsTable.name);
  res.json(rows.map(mapRow));
});

router.post("/pools", requireRole("superuser", "admin"), async (req, res) => {
  const { name, facilityId, poolType, isActive, volumeLitres, customPhMin, customPhMax, customFreeChlorineMin, customFreeChlorineMax, customTempMin, customTempMax, customTurbidityMax, customCombinedChlorineMax, notes } = req.body;
  if (!name || !facilityId) return res.status(400).json({ error: "name and facilityId required" });
  const [row] = await db.insert(poolsTable).values({ name, facilityId, poolType: poolType ?? "pool", isActive: isActive ?? true, volumeLitres, customPhMin, customPhMax, customFreeChlorineMin, customFreeChlorineMax, customTempMin, customTempMax, customTurbidityMax, customCombinedChlorineMax, notes, createdBy: req.user?.id ?? null }).returning();
  res.status(201).json(row);
});

router.get("/pools/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select(baseSelect)
    .from(poolsTable)
    .leftJoin(facilitiesTable, eq(poolsTable.facilityId, facilitiesTable.id))
    .leftJoin(updaterUsers, eq(poolsTable.updatedBy, updaterUsers.id))
    .leftJoin(creatorUsers, eq(poolsTable.createdBy, creatorUsers.id))
    .where(eq(poolsTable.id, id))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(mapRow(rows[0]));
});

router.patch("/pools/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["name", "poolType", "isActive", "volumeLitres", "customPhMin", "customPhMax", "customFreeChlorineMin", "customFreeChlorineMax", "customTempMin", "customTempMax", "customTurbidityMax", "customCombinedChlorineMax", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [before] = await db.select().from(poolsTable).where(eq(poolsTable.id, id)).limit(1);
  if (!before) return res.status(404).json({ error: "Not found" });
  updates.updatedAt = new Date();
  updates.updatedBy = req.user?.id ?? null;
  const [row] = await db.update(poolsTable).set(updates as never).where(eq(poolsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const changes = diffChanges(before as Record<string, unknown>, updates, fields);
  await recordAuditLog({ recordType: "pool", recordId: id, userId: req.user?.id ?? null, changes });
  res.json(row);
});

router.delete("/pools/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(poolsTable).where(eq(poolsTable.id, id));
  res.status(204).send();
});

export default router;
