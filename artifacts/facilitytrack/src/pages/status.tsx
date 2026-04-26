import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Waves, RefreshCw } from "lucide-react";

type CheckStatus = "ok" | "error";

interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  checks: {
    database: {
      status: CheckStatus;
      latencyMs?: number;
      error?: string;
    };
  };
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: HealthResponse; httpOk: boolean; fetchedAt: Date }
  | { kind: "unreachable"; fetchedAt: Date; message: string };

const POLL_INTERVAL_MS = 15_000;

function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const mins = Math.floor((s % 3_600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (mins || hours || days) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

type Indicator = {
  level: "green" | "yellow" | "red";
  label: string;
  description: string;
};

function getOverallIndicator(state: FetchState): Indicator {
  if (state.kind === "loading") {
    return {
      level: "yellow",
      label: "Checking…",
      description: "Contacting the service to check current status.",
    };
  }
  if (state.kind === "unreachable") {
    return {
      level: "red",
      label: "Service unreachable",
      description: "We could not reach the API. The service may be down.",
    };
  }
  if (state.data.status === "ok") {
    return {
      level: "green",
      label: "All systems operational",
      description: "All monitored components are responding normally.",
    };
  }
  return {
    level: "yellow",
    label: "Service degraded",
    description: "One or more components are reporting problems.",
  };
}

const LEVEL_STYLES: Record<Indicator["level"], { dot: string; ring: string; text: string; badge: string }> = {
  green: {
    dot: "bg-green-500",
    ring: "ring-green-500/30",
    text: "text-green-700 dark:text-green-400",
    badge: "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300",
  },
  yellow: {
    dot: "bg-yellow-500",
    ring: "ring-yellow-500/30",
    text: "text-yellow-700 dark:text-yellow-400",
    badge: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  red: {
    dot: "bg-red-500",
    ring: "ring-red-500/30",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300",
  },
};

function ComponentRow({
  name,
  level,
  detail,
}: {
  name: string;
  level: Indicator["level"];
  detail: string;
}) {
  const styles = LEVEL_STYLES[level];
  const labelByLevel: Record<Indicator["level"], string> = {
    green: "Operational",
    yellow: "Degraded",
    red: "Outage",
  };
  return (
    <div
      className="flex items-center justify-between py-3 border-b last:border-b-0"
      data-testid={`status-component-${name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-3">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${styles.dot}`} aria-hidden />
        <span className="font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground hidden sm:inline">{detail}</span>
        <Badge variant="secondary" className={styles.badge}>
          {labelByLevel[level]}
        </Badge>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/health", {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = (await res.json()) as HealthResponse;
      setState({ kind: "ready", data, httpOk: res.ok, fetchedAt: new Date() });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        kind: "unreachable",
        fetchedAt: new Date(),
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [load]);

  const overall = getOverallIndicator(state);
  const overallStyles = LEVEL_STYLES[overall.level];

  let apiLevel: Indicator["level"] = "yellow";
  let apiDetail = "Checking…";
  if (state.kind === "ready") {
    if (state.httpOk) {
      apiLevel = "green";
      apiDetail = "HTTP 200 OK";
    } else {
      apiLevel = "yellow";
      apiDetail = "Reachable but degraded";
    }
  } else if (state.kind === "unreachable") {
    apiLevel = "red";
    apiDetail = "Unreachable";
  }

  let dbLevel: Indicator["level"] = "yellow";
  let dbDetail = "Checking…";
  if (state.kind === "ready") {
    if (state.data.checks.database.status === "ok") {
      dbLevel = "green";
      const lat = state.data.checks.database.latencyMs;
      dbDetail = typeof lat === "number" ? `Responding in ${lat} ms` : "Responding";
    } else {
      dbLevel = "red";
      dbDetail = state.data.checks.database.error ?? "Connection error";
    }
  } else if (state.kind === "unreachable") {
    dbLevel = "red";
    dbDetail = "Unknown — API unreachable";
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <Waves className="w-6 h-6 text-primary" />
          <span className="font-semibold">FacilityTrack</span>
          <span className="ml-auto text-sm text-muted-foreground">Service Status</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Card data-testid="status-overall">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div
                className={`relative flex items-center justify-center w-12 h-12 rounded-full ring-8 ${overallStyles.ring}`}
              >
                <span className={`w-4 h-4 rounded-full ${overallStyles.dot}`} aria-hidden />
              </div>
              <div className="flex-1">
                <CardTitle className={`text-2xl ${overallStyles.text}`} data-testid="status-overall-label">
                  {overall.label}
                </CardTitle>
                <CardDescription>{overall.description}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setState({ kind: "loading" });
                  load();
                }}
                data-testid="status-refresh"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Components</CardTitle>
            <CardDescription>Live checks updated every {POLL_INTERVAL_MS / 1000} seconds.</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <ComponentRow name="API" level={apiLevel} detail={apiDetail} />
              <ComponentRow name="Database" level={dbLevel} detail={dbDetail} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground space-y-1">
            {state.kind === "ready" && (
              <>
                <div data-testid="status-uptime">
                  <span className="font-medium text-foreground">Uptime:</span> {formatUptime(state.data.uptime)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Server time:</span>{" "}
                  {new Date(state.data.timestamp).toLocaleString()}
                </div>
              </>
            )}
            {state.kind === "unreachable" && (
              <div data-testid="status-error" className="text-red-600 dark:text-red-400">
                Unable to reach the status endpoint: {state.message}
              </div>
            )}
            {state.kind !== "loading" && (
              <div>
                <span className="font-medium text-foreground">Last checked:</span>{" "}
                {state.fetchedAt.toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          This page is public and does not require sign-in.
        </p>
      </main>
    </div>
  );
}
