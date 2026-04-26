import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, appUsersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.get("/audit-logs", async (req, res) => {
  const recordType = (req.query.recordType as string | undefined) ?? undefined;
  const recordId = req.query.recordId ? Number(req.query.recordId) : null;
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 20;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  if (!recordType || !recordId) {
    return res.status(400).json({ error: "recordType and recordId required" });
  }

  const rows = await db
    .select({
      id: auditLogsTable.id,
      recordType: auditLogsTable.recordType,
      recordId: auditLogsTable.recordId,
      userId: auditLogsTable.userId,
      action: auditLogsTable.action,
      changes: auditLogsTable.changes,
      createdAt: auditLogsTable.createdAt,
      userFirstName: appUsersTable.firstName,
      userLastName: appUsersTable.lastName,
    })
    .from(auditLogsTable)
    .leftJoin(appUsersTable, eq(auditLogsTable.userId, appUsersTable.id))
    .where(and(eq(auditLogsTable.recordType, recordType), eq(auditLogsTable.recordId, recordId)))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const mapped = rows.map((r) => {
    const { userFirstName, userLastName, ...rest } = r;
    const userName = userFirstName
      ? `${userFirstName}${userLastName ? " " + userLastName : ""}`
      : null;
    return { ...rest, userName };
  });
  res.json(mapped);
});

export default router;
