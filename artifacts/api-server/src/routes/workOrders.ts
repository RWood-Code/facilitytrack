import { Router } from "express";
import { db } from "@workspace/db";
import { workOrdersTable, staffTable, assetsTable, appUsersTable } from "@workspace/db";
import { alias } from "drizzle-orm/sqlite-core";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import { diffChanges, recordAuditLog } from "../lib/audit";

const router = Router();

const updaterUsers = alias(appUsersTable, "updater_users");
const creatorUsers = alias(appUsersTable, "creator_users");

router.get("/work-orders", async (req, res) => {
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const assignedTo = req.query.assignedTo ? Number(req.query.assignedTo) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  const conditions = [];
  if (status) conditions.push(eq(workOrdersTable.status, status));
  if (priority) conditions.push(eq(workOrdersTable.priority, priority));
  if (assignedTo) conditions.push(eq(workOrdersTable.assignedTo, assignedTo));

  const rows = await db
    .select({
      id: workOrdersTable.id,
      title: workOrdersTable.title,
      description: workOrdersTable.description,
      facilityId: workOrdersTable.facilityId,
      poolId: workOrdersTable.poolId,
      assetId: workOrdersTable.assetId,
      assetName: assetsTable.name,
      priority: workOrdersTable.priority,
      status: workOrdersTable.status,
      assignedTo: workOrdersTable.assignedTo,
      assignedToFirstName: staffTable.firstName,
      assignedToLastName: staffTable.lastName,
      dueDate: workOrdersTable.dueDate,
      completedAt: workOrdersTable.completedAt,
      notes: workOrdersTable.notes,
      createdAt: workOrdersTable.createdAt,
      createdBy: workOrdersTable.createdBy,
      createdByFirstName: creatorUsers.firstName,
      createdByLastName: creatorUsers.lastName,
      updatedAt: workOrdersTable.updatedAt,
      updatedBy: workOrdersTable.updatedBy,
      updatedByFirstName: updaterUsers.firstName,
      updatedByLastName: updaterUsers.lastName,
    })
    .from(workOrdersTable)
    .leftJoin(staffTable, eq(workOrdersTable.assignedTo, staffTable.id))
    .leftJoin(assetsTable, eq(workOrdersTable.assetId, assetsTable.id))
    .leftJoin(updaterUsers, eq(workOrdersTable.updatedBy, updaterUsers.id))
    .leftJoin(creatorUsers, eq(workOrdersTable.createdBy, creatorUsers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(workOrdersTable.createdAt))
    .limit(limit);

  const mapped = rows.map(r => {
    const { assignedToFirstName, assignedToLastName, updatedByFirstName, updatedByLastName, createdByFirstName, createdByLastName, ...rest } = r;
    const assignedToName = assignedToFirstName
      ? `${assignedToFirstName}${assignedToLastName ? " " + assignedToLastName : ""}`
      : null;
    const updatedByName = updatedByFirstName
      ? `${updatedByFirstName}${updatedByLastName ? " " + updatedByLastName : ""}`
      : null;
    const createdByName = createdByFirstName
      ? `${createdByFirstName}${createdByLastName ? " " + createdByLastName : ""}`
      : null;
    return { ...rest, assignedToName, createdByName, updatedByName };
  });
  res.json(mapped);
});

router.post("/work-orders", requireRole("superuser", "admin"), async (req, res) => {
  const { title, description, facilityId, poolId, assetId, priority, assignedTo, dueDate, notes } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const [row] = await db.insert(workOrdersTable).values({ title, description, facilityId, poolId, assetId, priority: priority ?? "medium", assignedTo, dueDate: dueDate ? new Date(dueDate) : undefined, notes, createdBy: req.user?.id ?? null }).returning();
  res.status(201).json(row);
});

router.get("/work-orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/work-orders/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const fields = ["title", "description", "priority", "status", "assignedTo", "assetId", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  if (req.body.completedAt !== undefined) updates.completedAt = req.body.completedAt ? new Date(req.body.completedAt) : null;
  const [before] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, id)).limit(1);
  if (!before) return res.status(404).json({ error: "Not found" });
  updates.updatedAt = new Date();
  updates.updatedBy = req.user?.id ?? null;
  const [row] = await db.update(workOrdersTable).set(updates as never).where(eq(workOrdersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const auditFields = [...fields, "dueDate", "completedAt"];
  const changes = diffChanges(before as Record<string, unknown>, updates, auditFields);
  await recordAuditLog({ recordType: "work_order", recordId: id, userId: req.user?.id ?? null, changes });
  res.json(row);
});

router.delete("/work-orders/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(workOrdersTable).where(eq(workOrdersTable.id, id));
  res.status(204).send();
});

export default router;
