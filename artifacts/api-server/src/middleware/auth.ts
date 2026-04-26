import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { appUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const users = await db.select().from(appUsersTable).where(eq(appUsersTable.id, req.session.userId)).limit(1);
  const user = users[0];
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: typeof appUsersTable.$inferSelect;
    }
  }
}
