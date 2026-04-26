import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { appUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

function sanitize(user: Record<string, unknown>) {
  const { passwordHash: _, pin: __, ...safe } = user;
  return safe;
}

function requireAdminOrSelf(req: Request, res: Response, targetId: number) {
  const user = req.user;
  if (!user) return false;
  if (user.role === "superuser" || user.role === "admin") return true;
  if (user.id === targetId) return true;
  res.status(403).json({ error: "Insufficient permissions" });
  return false;
}

router.get("/app-users", requireRole("superuser", "admin"), async (_req, res) => {
  const rows = await db.select().from(appUsersTable).orderBy(appUsersTable.lastName);
  res.json(rows.map(sanitize));
});

router.post("/app-users", requireRole("superuser", "admin"), async (req, res) => {
  const { email, firstName, lastName, role, password, pin, isActive } = req.body;
  if (!email || !firstName || !lastName || !role || !password) return res.status(400).json({ error: "email, firstName, lastName, role, password required" });
  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = pin ? await bcrypt.hash(pin, 10) : undefined;
  const [row] = await db.insert(appUsersTable).values({ email: email.toLowerCase(), firstName, lastName, role, passwordHash, pin: pinHash, isActive: isActive ?? true }).returning();
  res.status(201).json(sanitize(row as unknown as Record<string, unknown>));
});

router.get("/app-users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!requireAdminOrSelf(req, res, id)) return;
  const rows = await db.select().from(appUsersTable).where(eq(appUsersTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(sanitize(rows[0] as unknown as Record<string, unknown>));
});

router.patch("/app-users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!requireAdminOrSelf(req, res, id)) return;

  const updates: Record<string, unknown> = {};
  const baseFields = ["firstName", "lastName"];
  for (const f of baseFields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const adminFields = ["email", "role", "isActive"];
  const isAdmin = req.user?.role === "superuser" || req.user?.role === "admin";
  if (isAdmin) {
    for (const f of adminFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
  }

  if (req.body.password) updates.passwordHash = await bcrypt.hash(req.body.password, 10);
  if (req.body.pin !== undefined) updates.pin = req.body.pin ? await bcrypt.hash(req.body.pin, 10) : null;
  updates.updatedAt = new Date();
  const [row] = await db.update(appUsersTable).set(updates as never).where(eq(appUsersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(sanitize(row as unknown as Record<string, unknown>));
});

router.delete("/app-users/:id", requireRole("superuser", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(appUsersTable).where(eq(appUsersTable.id, id));
  res.status(204).send();
});

export default router;
