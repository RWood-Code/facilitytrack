import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";

export const trainingRecordsTable = sqliteTable("training_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  trainingName: text("training_name").notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  provider: text("provider"),
  durationHours: real("duration_hours"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertTrainingRecordSchema = createInsertSchema(trainingRecordsTable).omit({ id: true, createdAt: true });
export type InsertTrainingRecord = z.infer<typeof insertTrainingRecordSchema>;
export type TrainingRecord = typeof trainingRecordsTable.$inferSelect;
