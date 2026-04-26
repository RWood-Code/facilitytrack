import { useEffect, useState, type ReactNode } from "react";
import {
  activateLicense,
  fetchLicenseStatus,
  isLicenseAllowed,
  type LicenseStatusResponse,
} from "@/lib/license";

interface LicenseGateProps {
  children: ReactNode;
}

type View = "loading" | "blocked" | "allowed" | "error";

/**
 * Wraps the entire authenticated app. On mount it queries `/api/license/status`
 * and renders an activation form if the licence is missing/invalid. Once
 * activation succeeds, children render normally.
 *
 * Re-checks every 30 minutes in the background so revoked or expired licences
 * lock the app within a reasonable window without a full reload.
 */
export function LicenseGate({ children }: LicenseGateProps) {
  const [view, setView] = useState<View>("loading");
  const [status, setStatus] = useState<LicenseStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await fetchLicenseStatus();
      setStatus(s);
      setView(isLicenseAllowed(s.status) ? "allowed" : "blocked");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setView("error");
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (view === "loading") {
    return <CenteredSpinner label="Checking licence…" />;
  }
  if (view === "error") {
    return (
      <CenteredCard title="Licence check failed">
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <button
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => {
            setView("loading");
            void refresh();
          }}
        >
          Retry
        </button>
      </CenteredCard>
    );
  }
  if (view === "blocked") {
    return <ActivationForm currentStatus={status} onActivated={refresh} />;
  }
  return (
    <>
      {status?.status === "grace" ? <GraceBanner status={status} /> : null}
      {children}
    </>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-2 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CenteredCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function ActivationForm({
  currentStatus,
  onActivated,
}: {
  currentStatus: LicenseStatusResponse | null;
  onActivated: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    const result = await activateLicense({
      key: key.trim(),
      serverUrl: serverUrl.trim() || undefined,
    });
    setSubmitting(false);
    if ("error" in result) {
      setErrorMsg(result.error);
      return;
    }
    await onActivated();
  }

  const headline = headlineFor(currentStatus);

  return (
    <CenteredCard title={headline.title}>
      <p className="text-sm text-muted-foreground">{headline.body}</p>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-xs font-medium text-foreground">Licence key</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2"
            autoFocus
            required
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider"
          />
        </label>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Show"} advanced options
        </button>
        {showAdvanced ? (
          <label className="block">
            <span className="text-xs font-medium text-foreground">
              Licence server URL (override)
            </span>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://licences.example.com"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        ) : null}
        {errorMsg ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={submitting || key.length === 0}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Activating…" : "Activate"}
        </button>
      </form>
    </CenteredCard>
  );
}

function headlineFor(s: LicenseStatusResponse | null): { title: string; body: string } {
  if (!s || s.status === "never_activated") {
    return {
      title: "Activate FacilityTrack",
      body: "Enter the licence key supplied with your purchase to start using FacilityTrack.",
    };
  }
  if (s.status === "revoked") {
    return {
      title: "Licence revoked",
      body: "This licence has been revoked. Please contact your supplier or enter a new key.",
    };
  }
  if (s.status === "expired") {
    return {
      title: "Licence expired",
      body: `Your licence expired on ${formatDate(s.expiresAt)}. Renew with your supplier and enter the new key below.`,
    };
  }
  if (s.status === "expired_grace") {
    return {
      title: "Licence verification overdue",
      body: "We have not been able to reach the licence server for over 30 days. Please reconnect this PC to the internet, then re-enter your key to continue.",
    };
  }
  return {
    title: "Licence required",
    body: "Please enter your licence key to continue.",
  };
}

function GraceBanner({ status }: { status: LicenseStatusResponse }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      Working offline — licence server last reached on {formatDate(status.lastValidatedAt)}.{" "}
      {status.graceRemainingDays !== null
        ? `${status.graceRemainingDays} day${status.graceRemainingDays === 1 ? "" : "s"} remaining before re-verification is required.`
        : null}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
