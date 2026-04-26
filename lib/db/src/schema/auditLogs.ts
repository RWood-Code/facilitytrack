import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export type AuditChange = { from: unknown; to: unknown };
export type AuditChanges = Record<string, AuditChange>;

export const auditLogsTable = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordType: text("record_type").notNull(),
    recordId: integer("record_id").notNull(),
    userId: integer("user_id"),
    action: text("action").notNull().default("update"),
    changes: text("changes", { mode: "json" }).$type<AuditChanges>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("audit_logs_record_idx").on(t.recordType, t.recordId, t.createdAt)],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
