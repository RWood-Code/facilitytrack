import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { poolsTable } from "./pools";

export const steamRoomChecksTable = sqliteTable("steam_room_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  checkedBy: text("checked_by"),
  checkedAt: integer("checked_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  temperature: real("temperature"),
  humidity: real("humidity"),
  isClean: integer("is_clean", { mode: "boolean" }),
  isOperational: integer("is_operational", { mode: "boolean" }),
  entryType: text("entry_type").notNull().default("day_log"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertSteamRoomCheckSchema = createInsertSchema(steamRoomChecksTable).omit({ id: true, createdAt: true });
export type InsertSteamRoomCheck = z.infer<typeof insertSteamRoomCheckSchema>;
export type SteamRoomCheck = typeof steamRoomChecksTable.$inferSelect;
