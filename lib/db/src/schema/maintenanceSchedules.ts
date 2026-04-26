import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const maintenanceSchedulesTable = sqliteTable("maintenance_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  facilityId: integer("facility_id"),
  assetId: integer("asset_id"),
  frequency: text("frequency").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  lastCompletedAt: integer("last_completed_at", { mode: "timestamp" }),
  nextDueAt: integer("next_due_at", { mode: "timestamp" }),
  assignedTo: integer("assigned_to"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertMaintenanceScheduleSchema = createInsertSchema(maintenanceSchedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMaintenanceSchedule = z.infer<typeof insertMaintenanceScheduleSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedulesTable.$inferSelect;
