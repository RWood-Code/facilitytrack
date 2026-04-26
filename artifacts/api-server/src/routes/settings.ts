import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
const requireAdmin = requireRole("admin", "superuser");

const router = Router();

router.get("/settings", async (req, res) => {
  const rows = await db.select().from(systemSettingsTable).orderBy(systemSettingsTable.category, systemSettingsTable.key);
  res.json(rows);
});

router.put("/settings", requireAdmin, async (req, res) => {
  const { key, value, label, category } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });

  const [row] = await db
    .insert(systemSettingsTable)
    .values({ key, value, label, category })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value, label, category, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

export default router;
