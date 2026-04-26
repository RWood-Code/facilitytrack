import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { appUsersTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const router = Router();

type RateBucket = { count: number; resetAt: number };
const loginBuckets = new Map<string, RateBucket>();

function isRateLimited(key: string, maxAttempts = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    loginBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= maxAttempts) return true;
  bucket.count += 1;
  return false;
}

function clientKey(req: import("express").Request, prefix: string): string {
  return `${prefix}:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  if (isRateLimited(clientKey(req, "login"))) {
    return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  }

  const users = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase())).limit(1);
  const user = users[0];
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  req.session.userId = user.id;
  const { passwordHash: _, pin: __, ...safe } = user;
  return res.json(safe);
});

router.post("/auth/pin-login", async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "pin required" });

  if (isRateLimited(clientKey(req, "pin"), 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many PIN attempts. Try again in 15 minutes." });
  }

  const users = await db
    .select()
    .from(appUsersTable)
    .where(and(eq(appUsersTable.isActive, true), isNotNull(appUsersTable.pin)));

  let matchedUser: (typeof users)[0] | null = null;
  for (const user of users) {
    if (!user.pin) continue;
    const match = await bcrypt.compare(pin, user.pin);
    if (match) {
      matchedUser = user;
      break;
    }
  }

  if (!matchedUser) return res.status(401).json({ error: "Invalid PIN" });

  req.session.userId = matchedUser.id;
  const { passwordHash: _, pin: __, ...safe } = matchedUser;
  return res.json(safe);
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

  const users = await db.select().from(appUsersTable).where(eq(appUsersTable.id, req.session.userId)).limit(1);
  const user = users[0];
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { passwordHash: _, pin: __, ...safe } = user;
  return res.json(safe);
});

export default router;
