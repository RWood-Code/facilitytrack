import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";

export const staffQualificationsTable = sqliteTable("staff_qualifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  qualificationName: text("qualification_name").notNull(),
  issuer: text("issuer"),
  issuedDate: integer("issued_date", { mode: "timestamp" }),
  expiryDate: integer("expiry_date", { mode: "timestamp" }),
  certificateNumber: text("certificate_number"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertStaffQualificationSchema = createInsertSchema(staffQualificationsTable).omit({ id: true, createdAt: true });
export type InsertStaffQualification = z.infer<typeof insertStaffQualificationSchema>;
export type StaffQualification = typeof staffQualificationsTable.$inferSelect;
