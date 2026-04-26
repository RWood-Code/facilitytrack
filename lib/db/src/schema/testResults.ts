import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";

export const testResultsTable = sqliteTable("test_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  testedBy: text("tested_by"),
  testedAt: integer("tested_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  freeChlorine: real("free_chlorine"),
  totalAvailableChlorine: real("total_available_chlorine"),
  combinedChlorine: real("combined_chlorine"),
  ph: real("ph"),
  temperature: real("temperature"),
  turbidity: real("turbidity"),
  totalAlkalinity: real("total_alkalinity"),
  isCompliant: integer("is_compliant", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertTestResultSchema = createInsertSchema(testResultsTable).omit({ id: true, createdAt: true, isCompliant: true });
export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
export type TestResult = typeof testResultsTable.$inferSelect;
