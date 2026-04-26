import { eq } from "drizzle-orm";
import { getDb, licenseState, type LicenseState } from "@workspace/db";
import { logger } from "./logger";

export type ValidationStatus = "active" | "expired" | "revoked" | "unknown";

export interface ValidationResult {
  valid: boolean;
  status: ValidationStatus;
  expiresAt?: string;
  customerName?: string;
}

export interface LicenseStatusResponse {
  activated: boolean;
  status: ValidationStatus | "never_activated" | "grace" | "expired_grace";
  expiresAt: string | null;
  customerName: string | null;
  lastValidatedAt: string | null;
  serverReachable: boolean;
  graceRemainingDays: number | null;
}

const SINGLETON_ID = 1;
/** Days a previously-active licence remains usable when the server is unreachable. */
export const OFFLINE_GRACE_DAYS = 30;

export async function getStoredLicense(): Promise<LicenseState | null> {
  const db = getDb();
  const rows = await db.select().from(licenseState).where(eq(licenseState.id, SINGLETON_ID));
  return rows[0] ?? null;
}

/**
 * Call the licence server's `/api/validate` endpoint. Returns null on
 * network/timeout errors. Throws nothing.
 */
export async function callLicenseServer(
  serverUrl: string,
  key: string,
  fingerprint?: string,
  timeoutMs = 5000,
): Promise<ValidationResult | null> {
  const url = serverUrl.replace(/\/+$/, "") + "/api/validate";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, machineFingerprint: fingerprint }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    const status = (body.status as ValidationStatus | undefined) ?? "unknown";
    return {
      valid: Boolean(body.valid),
      status,
      expiresAt: body.expiresAt as string | undefined,
      customerName: body.customerName as string | undefined,
    };
  } catch (err) {
    logger.warn({ err, serverUrl }, "Licence server unreachable");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Activate or re-validate a licence. Persists the result to license_state.
 * Returns the validation result; `null` if the server was unreachable.
 */
export async function activateLicense(opts: {
  serverUrl: string;
  key: string;
  fingerprint?: string;
}): Promise<ValidationResult | null> {
  const result = await callLicenseServer(opts.serverUrl, opts.key, opts.fingerprint);
  if (!result) return null;

  const db = getDb();
  const now = new Date();
  const existing = await getStoredLicense();
  const expiresAt = result.expiresAt ? new Date(result.expiresAt) : new Date(0);

  if (existing) {
    await db
      .update(licenseState)
      .set({
        licenseKey: opts.key,
        serverUrl: opts.serverUrl,
        lastStatus: result.status,
        expiresAt,
        lastValidatedAt: now,
        lastCheckedAt: now,
        customerName: result.customerName ?? null,
        updatedAt: now,
      })
      .where(eq(licenseState.id, SINGLETON_ID));
  } else {
    await db.insert(licenseState).values({
      id: SINGLETON_ID,
      licenseKey: opts.key,
      serverUrl: opts.serverUrl,
      lastStatus: result.status,
      expiresAt,
      lastValidatedAt: now,
      lastCheckedAt: now,
      customerName: result.customerName ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
  return result;
}

/** Background revalidate against the configured server. Mutates lastCheckedAt
 * always; mutates lastValidatedAt + expiresAt only when the call succeeds. */
export async function revalidateLicense(): Promise<void> {
  const stored = await getStoredLicense();
  if (!stored) return;
  const result = await callLicenseServer(stored.serverUrl, stored.licenseKey);
  const db = getDb();
  const now = new Date();
  if (result) {
    await db
      .update(licenseState)
      .set({
        lastStatus: result.status,
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : stored.expiresAt,
        lastValidatedAt: now,
        lastCheckedAt: now,
        customerName: result.customerName ?? stored.customerName,
        updatedAt: now,
      })
      .where(eq(licenseState.id, SINGLETON_ID));
  } else {
    await db
      .update(licenseState)
      .set({ lastCheckedAt: now })
      .where(eq(licenseState.id, SINGLETON_ID));
  }
}

/**
 * Compute the effective licence state for the running app.
 *  - never_activated → block; FE shows activation form.
 *  - active → allow.
 *  - revoked → block.
 *  - expired (server-confirmed) → block.
 *  - server unreachable + lastStatus=active + within OFFLINE_GRACE_DAYS → allow (grace).
 *  - server unreachable + outside grace → block (expired_grace).
 */
export async function getLicenseStatus(): Promise<LicenseStatusResponse> {
  // Dev bypass: in non-production environments (Replit dev preview, local
  // `pnpm dev`, mockup sandbox), report a synthetic active licence so the
  // frontend gate and `requireValidLicense` middleware don't block work.
  // The Electron desktop app sets NODE_ENV=production in main.ts before
  // booting the embedded server, so customer installs are unaffected.
  if (process.env.NODE_ENV !== "production") {
    const farFuture = new Date(Date.now() + 365 * 86_400_000);
    const now = new Date();
    return {
      activated: true,
      status: "active",
      expiresAt: farFuture.toISOString(),
      customerName: "Development",
      lastValidatedAt: now.toISOString(),
      serverReachable: true,
      graceRemainingDays: null,
    };
  }
  const stored = await getStoredLicense();
  if (!stored) {
    return {
      activated: false,
      status: "never_activated",
      expiresAt: null,
      customerName: null,
      lastValidatedAt: null,
      serverReachable: false,
      graceRemainingDays: null,
    };
  }
  const now = Date.now();
  const expiresAtMs = stored.expiresAt.getTime();
  const lastValidatedMs = stored.lastValidatedAt.getTime();
  const lastCheckedMs = stored.lastCheckedAt.getTime();
  const reachable = lastCheckedMs - lastValidatedMs < 60_000; // last attempt succeeded recently

  if (stored.lastStatus === "revoked") {
    return base(stored, "revoked", reachable, null);
  }
  if (expiresAtMs < now) {
    return base(stored, "expired", reachable, null);
  }
  // Active per last server response.
  if (lastValidatedMs >= now - 24 * 3600_000) {
    return base(stored, "active", true, null);
  }
  // Stale: how long since a successful server confirmation?
  const daysSince = (now - lastValidatedMs) / 86_400_000;
  if (daysSince <= OFFLINE_GRACE_DAYS) {
    return base(stored, "grace", false, OFFLINE_GRACE_DAYS - daysSince);
  }
  return base(stored, "expired_grace", false, 0);
}

function base(
  s: LicenseState,
  status: LicenseStatusResponse["status"],
  serverReachable: boolean,
  graceRemainingDays: number | null,
): LicenseStatusResponse {
  return {
    activated: true,
    status,
    expiresAt: s.expiresAt.toISOString(),
    customerName: s.customerName,
    lastValidatedAt: s.lastValidatedAt.toISOString(),
    serverReachable,
    graceRemainingDays:
      graceRemainingDays === null ? null : Math.max(0, Math.round(graceRemainingDays)),
  };
}

export function isAllowed(status: LicenseStatusResponse["status"]): boolean {
  return status === "active" || status === "grace";
}

let revalidateTimer: ReturnType<typeof setInterval> | null = null;

/** Start a background revalidator (every 6 hours). Idempotent. */
export function startLicenseRevalidator(): void {
  if (revalidateTimer) return;
  // Initial kick a few seconds after boot.
  setTimeout(() => {
    revalidateLicense().catch((err) => logger.warn({ err }, "Revalidate failed"));
  }, 5_000);
  revalidateTimer = setInterval(
    () => {
      revalidateLicense().catch((err) => logger.warn({ err }, "Revalidate failed"));
    },
    6 * 3600_000,
  );
  // Don't keep the event loop alive just for this.
  if (typeof revalidateTimer.unref === "function") revalidateTimer.unref();
}
