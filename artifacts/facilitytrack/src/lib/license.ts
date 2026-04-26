/**
 * Licence client for the FacilityTrack frontend. Uses plain fetch (these
 * endpoints sit outside the OpenAPI-generated client to avoid the regen
 * round-trip for two routes).
 */

export type LicenseEffectiveStatus =
  | "active"
  | "grace"
  | "expired"
  | "expired_grace"
  | "revoked"
  | "never_activated"
  | "unknown";

export interface LicenseStatusResponse {
  activated: boolean;
  status: LicenseEffectiveStatus;
  expiresAt: string | null;
  customerName: string | null;
  lastValidatedAt: string | null;
  serverReachable: boolean;
  graceRemainingDays: number | null;
}

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "") + "/api";

export async function fetchLicenseStatus(): Promise<LicenseStatusResponse> {
  const res = await fetch(`${API_BASE}/license/status`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`License status request failed: ${res.status}`);
  }
  return (await res.json()) as LicenseStatusResponse;
}

export async function activateLicense(input: {
  key: string;
  serverUrl?: string;
}): Promise<{ activated: true; license: LicenseStatusResponse } | { error: string }> {
  const res = await fetch(`${API_BASE}/license/activate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) {
    return (await res.json()) as { activated: true; license: LicenseStatusResponse };
  }
  let msg = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string; status?: string };
    if (body.error) msg = body.error;
    if (body.status) msg += ` — ${body.status}`;
  } catch {
    // ignore
  }
  return { error: msg };
}

/** Allowed states. */
export function isLicenseAllowed(status: LicenseEffectiveStatus): boolean {
  return status === "active" || status === "grace";
}
