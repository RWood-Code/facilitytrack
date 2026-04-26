import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assetsTable } from "./assets";

export const assetAttachmentsTable = sqliteTable("asset_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  uploadedBy: text("uploaded_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertAssetAttachmentSchema = createInsertSchema(assetAttachmentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAssetAttachment = z.infer<typeof insertAssetAttachmentSchema>;
export type AssetAttachment = typeof assetAttachmentsTable.$inferSelect;
