import { Router } from "express";
import { db } from "@workspace/db";
import { facilitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/facilities", async (_req, res) => {
  const rows = await db.select().from(facilitiesTable).orderBy(facilitiesTable.name);
  res.json(rows);
});

router.post("/facilities", requireRole("superuser", "admin"), async (req, res) => {
  const { name, address, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const [row] = await db.insert(facilitiesTable).values({ name, address, phone, email }).returning();
  res.status(201).json(row);
});

router.get("/facilities/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(facilitiesTable).where(eq(facilitiesTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/facilities/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, address, phone, email } = req.body;
  const [row] = await db.update(facilitiesTable).set({ name, address, phone, email, updatedAt: new Date() }).where(eq(facilitiesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/facilities/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(facilitiesTable).where(eq(facilitiesTable.id, id));
  res.status(204).send();
});

export default router;
