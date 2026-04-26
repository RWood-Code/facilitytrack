import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { facilitiesTable } from "./facilities";

export const poolsTable = sqliteTable("pools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  facilityId: integer("facility_id").notNull().references(() => facilitiesTable.id, { onDelete: "cascade" }),
  poolType: text("pool_type").notNull().default("pool"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  volumeLitres: real("volume_litres"),
  customPhMin: real("custom_ph_min"),
  customPhMax: real("custom_ph_max"),
  customFreeChlorineMin: real("custom_free_chlorine_min"),
  customFreeChlorineMax: real("custom_free_chlorine_max"),
  customTempMin: real("custom_temp_min"),
  customTempMax: real("custom_temp_max"),
  customTurbidityMax: real("custom_turbidity_max"),
  customCombinedChlorineMax: real("custom_combined_chlorine_max"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  createdBy: integer("created_by"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedBy: integer("updated_by"),
});

export const insertPoolSchema = createInsertSchema(poolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPool = z.infer<typeof insertPoolSchema>;
export type Pool = typeof poolsTable.$inferSelect;
