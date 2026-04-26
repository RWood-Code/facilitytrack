import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { facilitiesTable } from "./facilities";

export const complianceDocumentsTable = sqliteTable("compliance_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  facilityId: integer("facility_id").references(() => facilitiesTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  documentName: text("document_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("current"),
  issuedDate: integer("issued_date", { mode: "timestamp" }),
  expiryDate: integer("expiry_date", { mode: "timestamp" }),
  issuedBy: text("issued_by"),
  referenceNumber: text("reference_number"),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;
export type ComplianceDocument = typeof complianceDocumentsTable.$inferSelect;
