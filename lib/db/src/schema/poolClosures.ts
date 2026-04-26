import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";

export const poolClosuresTable = sqliteTable("pool_closures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  closedBy: text("closed_by"),
  closedAt: integer("closed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  reopenedAt: integer("reopened_at", { mode: "timestamp" }),
  closureCode: text("closure_code"),
  reason: text("reason").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertPoolClosureSchema = createInsertSchema(poolClosuresTable).omit({ id: true, createdAt: true });
export type InsertPoolClosure = z.infer<typeof insertPoolClosureSchema>;
export type PoolClosure = typeof poolClosuresTable.$inferSelect;
