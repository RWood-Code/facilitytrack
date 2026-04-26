import { type Request, type Response, type NextFunction } from "express";
import * as crypto from "node:crypto";

/**
 * Minimum acceptable length for `LICENSE_ADMIN_PASSWORD` in production.
 * Long enough to make brute-forcing impractical even without rate limits.
 */
const MIN_PROD_PASSWORD_LENGTH = 16;

/**
 * Passwords that are explicitly forbidden in production. Includes the dev
 * default and other obviously weak choices so a misconfigured deployment
 * cannot ship with trivial credentials.
 */
const FORBIDDEN_PROD_PASSWORDS = new Set([
  "admin",
  "password",
  "changeme",
  "license",
  "licence",
  "facilitytrack",
]);

/**
 * Resolve the admin password used to gate /admin and /api/admin routes.
 *
 * In production:
 *  - `LICENSE_ADMIN_PASSWORD` MUST be set
 *  - it must be at least `MIN_PROD_PASSWORD_LENGTH` characters
 *  - it must not be a known weak default (`admin`, `password`, etc.)
 *
 * In development we fall back to `admin` and log a loud warning.
 */
export function getAdminPassword(): string {
  const fromEnv = process.env.LICENSE_ADMIN_PASSWORD;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!fromEnv || fromEnv.length === 0) {
      throw new Error("LICENSE_ADMIN_PASSWORD must be set in production");
    }
    if (fromEnv.length < MIN_PROD_PASSWORD_LENGTH) {
      throw new Error(
        `LICENSE_ADMIN_PASSWORD is too short (got ${fromEnv.length} chars, ` +
          `need >= ${MIN_PROD_PASSWORD_LENGTH}) — pick a long random secret`,
      );
    }
    if (FORBIDDEN_PROD_PASSWORDS.has(fromEnv.toLowerCase())) {
      throw new Error(
        "LICENSE_ADMIN_PASSWORD is a known weak default — pick a long random secret",
      );
    }
    return fromEnv;
  }

  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return "admin";
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Express middleware: HTTP Basic Auth gating with a single admin password.
 * The username portion is ignored — it's the password that matters.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="FacilityTrack Licence Admin"');
    res.status(401).send("Authentication required");
    return;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : decoded;
  const expected = getAdminPassword();
  if (!safeEqual(password, expected)) {
    res.set("WWW-Authenticate", 'Basic realm="FacilityTrack Licence Admin"');
    res.status(401).send("Invalid credentials");
    return;
  }
  next();
}
