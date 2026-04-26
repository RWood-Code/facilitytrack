import { db, auditLogsTable } from "@workspace/db";
import type { AuditChanges } from "@workspace/db";

export function diffChanges(
  before: Record<string, unknown>,
  updates: Record<string, unknown>,
  fields: string[],
): AuditChanges {
  const changes: AuditChanges = {};
  for (const f of fields) {
    if (!(f in updates)) continue;
    const fromVal = before[f] ?? null;
    const toVal = updates[f] ?? null;
    const fromIso = fromVal instanceof Date ? fromVal.toISOString() : fromVal;
    const toIso = toVal instanceof Date ? toVal.toISOString() : toVal;
    if (fromIso !== toIso) {
      changes[f] = { from: fromIso, to: toIso };
    }
  }
  return changes;
}

export async function recordAuditLog(params: {
  recordType: string;
  recordId: number;
  userId: number | null;
  changes: AuditChanges;
  action?: string;
}) {
  if (Object.keys(params.changes).length === 0) return;
  await db.insert(auditLogsTable).values({
    recordType: params.recordType,
    recordId: params.recordId,
    userId: params.userId,
    action: params.action ?? "update",
    changes: params.changes,
  });
}
