import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";

export const waterBalanceTestsTable = sqliteTable("water_balance_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  testedBy: text("tested_by"),
  testedAt: integer("tested_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  ph: real("ph"),
  totalAlkalinity: real("total_alkalinity"),
  calciumHardness: real("calcium_hardness"),
  cyanuricAcid: real("cyanuric_acid"),
  totalDissolvedSolids: real("total_dissolved_solids"),
  langelier: real("langelier"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertWaterBalanceTestSchema = createInsertSchema(waterBalanceTestsTable).omit({ id: true, createdAt: true });
export type InsertWaterBalanceTest = z.infer<typeof insertWaterBalanceTestSchema>;
export type WaterBalanceTest = typeof waterBalanceTestsTable.$inferSelect;
