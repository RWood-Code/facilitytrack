import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  FolderOpen,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdminOrHigher } from "@/lib/auth";
import {
  disableBackup,
  fetchBackupStatus,
  formatBackupAge,
  formatBytes,
  runBackupNow,
  updateBackupSchedule,
  type BackupStatus,
} from "@/lib/backup";
import { OneDriveFolderPicker } from "./OneDriveFolderPicker";

// ---------------------------------------------------------------------------
// Bridge to the Electron preload (`artifacts/desktop/src/preload.ts`).
//
// The preload exposes a typed surface on `window.facilityTrackDesktop` —
// declared here as a loose interface so the React build doesn't need to
// pull in Electron types. When the page is opened in a plain web browser
// (Replit preview), `window.facilityTrackDesktop` is undefined and we fall
// back to a "this is a desktop-only feature" message.
// ---------------------------------------------------------------------------

interface OneDriveConnectStartResult {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  message: string;
}

type OneDriveConnectEvent =
  | { type: "pending" }
  | { type: "success"; remoteFolder: string }
  | { type: "error"; message: string }
  | { type: "cancelled" };

interface DesktopBridge {
  isDesktop: true;
  startOneDriveConnect: () => Promise<OneDriveConnectStartResult>;
  cancelOneDriveConnect: () => Promise<{ cancelled: boolean }>;
  onOneDriveConnectEvent: (
    handler: (event: OneDriveConnectEvent) => void,
  ) => () => void;
}

function getDesktopBridge(): DesktopBridge | null {
  const bridge = (window as unknown as { facilityTrackDesktop?: DesktopBridge })
    .facilityTrackDesktop;
  return bridge && bridge.isDesktop ? bridge : null;
}

interface ConnectFlowState {
  userCode: string;
  verificationUri: string;
  message: string;
  status: "waiting" | "error";
  error?: string;
}

export function BackupCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Editable settings (folder + hour). Credentials are managed via the
  // device-code "Connect to OneDrive" flow, not by typing them in.
  const [targetFolder, setTargetFolder] = useState("FacilityTrack/Backups");
  const [scheduleHour, setScheduleHour] = useState(2);

  // OneDrive folder picker modal.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Device-code connect flow state.
  const [connectFlow, setConnectFlow] = useState<ConnectFlowState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Track whether we've already toasted the user about the current
  // needsReauth state so we don't bother them every poll/refresh. Reset
  // back to false once the issue clears, so a *future* re-auth event will
  // toast again.
  const reauthToastedRef = useRef(false);

  const desktop = getDesktopBridge();

  function applyStatus(s: BackupStatus) {
    setStatus(s);
    setTargetFolder(s.targetFolder);
    setScheduleHour(s.scheduleHour);
    // Toast on the false→true transition for the current session so the
    // customer notices the moment we detect the expired sign-in (vs. only
    // seeing it next time they're on Settings). Reset when it clears so a
    // future re-auth event will toast again.
    if (s.needsReauth && !reauthToastedRef.current) {
      reauthToastedRef.current = true;
      toast({
        title: "OneDrive sign-in expired",
        description:
          "Your OneDrive sign-in has expired and backups are paused. Click Reconnect to OneDrive to resume nightly backups.",
        variant: "destructive",
      });
    } else if (!s.needsReauth && reauthToastedRef.current) {
      reauthToastedRef.current = false;
    }
  }

  async function refresh() {
    try {
      const s = await fetchBackupStatus();
      applyStatus(s);
    } catch (err) {
      toast({
        title: "Could not load backup status",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  // Tear down the connect-event subscription when the component unmounts so
  // we don't accumulate listeners across remounts.
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  async function handleConnect() {
    if (!desktop) return;
    setConnecting(true);
    setConnectFlow(null);

    // Subscribe to progress events before starting so we don't miss the
    // success/error event for short flows.
    if (unsubscribeRef.current) unsubscribeRef.current();
    unsubscribeRef.current = desktop.onOneDriveConnectEvent((event) => {
      if (event.type === "success") {
        toast({
          title: "OneDrive connected",
          description: `Backups will upload to ${event.remoteFolder}.`,
        });
        setConnectFlow(null);
        setConnecting(false);
        void refresh();
      } else if (event.type === "error") {
        setConnectFlow((prev) =>
          prev
            ? { ...prev, status: "error", error: event.message }
            : {
                userCode: "",
                verificationUri: "",
                message: "",
                status: "error",
                error: event.message,
              },
        );
        setConnecting(false);
      } else if (event.type === "cancelled") {
        setConnecting(false);
      }
    });

    try {
      const start = await desktop.startOneDriveConnect();
      setConnectFlow({
        userCode: start.userCode,
        verificationUri: start.verificationUri,
        message: start.message,
        status: "waiting",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Could not start OneDrive connect",
        description: message,
        variant: "destructive",
      });
      setConnecting(false);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    }
  }

  async function handleCancelConnect() {
    if (desktop) {
      try {
        await desktop.cancelOneDriveConnect();
      } catch {
        /* ignore */
      }
    }
    setConnectFlow(null);
    setConnecting(false);
  }

  async function handleSaveSettings() {
    try {
      await updateBackupSchedule({ targetFolder, scheduleHour });
      toast({ title: "Backup settings saved" });
      setShowSettings(false);
      await refresh();
    } catch (err) {
      toast({
        title: "Failed to save settings",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleDisable() {
    try {
      await disableBackup();
      toast({ title: "Backup disabled" });
      await refresh();
    } catch (err) {
      toast({
        title: "Failed to disable",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const result = await runBackupNow();
      if (result.ok) {
        toast({ title: "Backup uploaded to OneDrive" });
      } else if (!result.state.needsReauth) {
        // The needsReauth case already produces its own dedicated toast via
        // applyStatus, so don't double-toast with a generic "Backup failed".
        toast({
          title: "Backup failed",
          description: result.error ?? "Unknown error",
          variant: "destructive",
        });
      }
      applyStatus(result.state);
    } finally {
      setRunning(false);
    }
  }

  // Defense in depth: even though /settings is admin-gated in the router,
  // ensure backup status (which can include server error details) is never
  // rendered for non-admin users.
  if (!isAdminOrHigher(user?.role)) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            OneDrive Backup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const s = status!;
  const lastSuccessAge = formatBackupAge(s.lastSuccessAt);
  const lastAttemptAge = formatBackupAge(s.lastAttemptAt);
  const failing = s.consecutiveFailures > 0;
  const hasHistory = s.lastAttemptAt !== null || s.lastSuccessAt !== null;

  return (
    <Card data-testid="card-backup">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          OneDrive Backup
        </CardTitle>
        {s.enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={running}
            onClick={handleRunNow}
            data-testid="button-backup-run"
          >
            {running ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            Run now
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {s.inProgress ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span data-testid="text-backup-status">Backup running now…</span>
            </>
          ) : s.enabled ? (
            s.needsReauth ? (
              <>
                <KeyRound className="w-4 h-4 text-destructive" />
                <span data-testid="text-backup-status">
                  Your OneDrive sign-in has expired — backups paused
                </span>
              </>
            ) : failing ? (
              <>
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span data-testid="text-backup-status">
                  Backup failing — last success {lastSuccessAge}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span data-testid="text-backup-status">
                  Last backup: {lastSuccessAge}
                  {s.lastBackupBytes != null && ` (${formatBytes(s.lastBackupBytes)})`}
                </span>
              </>
            )
          ) : (
            <span className="text-muted-foreground" data-testid="text-backup-status">
              {desktop
                ? "Backup not configured. Click Connect to OneDrive to sign in with your Microsoft account."
                : "OneDrive backup is configured from the FacilityTrack desktop app."}
            </span>
          )}
        </div>

        {hasHistory && (
          <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              Last successful run:{" "}
              <span
                className="text-foreground font-medium"
                data-testid="text-backup-last-success"
              >
                {lastSuccessAge}
              </span>
            </div>
            <div>
              Last attempted run:{" "}
              <span
                className="text-foreground font-medium"
                data-testid="text-backup-last-attempt"
              >
                {lastAttemptAge}
              </span>
            </div>
            {s.lastBackupBytes != null && (
              <div>
                Bytes uploaded:{" "}
                <span
                  className="text-foreground font-medium"
                  data-testid="text-backup-bytes"
                >
                  {formatBytes(s.lastBackupBytes)}
                </span>
              </div>
            )}
            {failing && (
              <div>
                Consecutive failures:{" "}
                <span
                  className="text-destructive font-medium"
                  data-testid="text-backup-failure-count"
                >
                  {s.consecutiveFailures}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Re-auth banner: shown instead of the generic "Last error" line so
            customers can't miss it. Replaces the bottom row of action buttons
            with a single big "Reconnect to OneDrive" call-to-action. */}
        {s.enabled && s.needsReauth && (
          <div
            className="border border-destructive/40 bg-destructive/10 rounded-md p-4 space-y-3"
            data-testid="banner-backup-needs-reauth"
          >
            <div className="flex items-start gap-2">
              <KeyRound className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-destructive">
                  Reconnect to OneDrive
                </div>
                <div className="text-xs text-foreground/80">
                  Microsoft has rejected the saved sign-in for this PC (this
                  usually happens after a password change or roughly 90 days
                  of no activity). Nightly backups won't resume until you
                  sign in again.
                </div>
                {s.lastSuccessAt && (
                  <div className="text-xs text-muted-foreground">
                    Last successful backup: {lastSuccessAge}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {desktop ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={connecting}
                  onClick={handleConnect}
                  data-testid="button-backup-reauth"
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4 mr-2" />
                  )}
                  Reconnect to OneDrive
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Open FacilityTrack on the desktop PC that runs backups and
                  click Reconnect to OneDrive there.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generic last-error line — only shown when we *don't* already have
            the dedicated re-auth banner, so the screen doesn't show two
            competing error rows for the same incident. */}
        {s.lastError && !s.needsReauth && (
          <div
            className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2"
            data-testid="text-backup-last-error"
          >
            Last error: {s.lastError}
          </div>
        )}

        {/* In-progress device-code prompt */}
        {connectFlow && (
          <div className="border rounded-md p-4 bg-muted/40 space-y-3">
            {connectFlow.status === "waiting" ? (
              <>
                <div className="text-sm font-medium">
                  Sign in to Microsoft to finish connecting
                </div>
                <div className="text-xs text-muted-foreground">
                  We opened the Microsoft sign-in page in your browser. Enter
                  the code below when prompted, then approve the request to
                  let FacilityTrack back up to your OneDrive.
                </div>
                <div className="flex items-center gap-3">
                  <code
                    className="text-2xl font-mono tracking-widest bg-background border rounded px-3 py-2 select-all"
                    data-testid="text-onedrive-user-code"
                  >
                    {connectFlow.userCode}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(connectFlow.userCode);
                      toast({ title: "Code copied" });
                    }}
                  >
                    Copy code
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(connectFlow.verificationUri, "_blank");
                    }}
                    data-testid="button-onedrive-open-browser"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open sign-in page again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelConnect}>
                    Cancel
                  </Button>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Waiting for you to approve in the browser…
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Connect failed
                </div>
                <div className="text-xs text-muted-foreground">
                  {connectFlow.error}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleConnect}>
                    Try again
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConnectFlow(null)}
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Connected state */}
        {s.enabled && !showSettings && !connectFlow && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              Folder: <span className="font-mono">{s.targetFolder}</span>
            </div>
            <div>
              Schedule: every day at {String(s.scheduleHour).padStart(2, "0")}:00
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSettings(true)}
                data-testid="button-backup-edit-settings"
              >
                Edit settings
              </Button>
              {desktop && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connecting}
                  onClick={handleConnect}
                  data-testid="button-backup-reconnect"
                >
                  {connecting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : null}
                  Reconnect to OneDrive
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleDisable}>
                Disable
              </Button>
            </div>
          </div>
        )}

        {/* First-time connect (not yet configured) */}
        {!s.enabled && !connectFlow && desktop && (
          <div className="border-t pt-4">
            <Button
              onClick={handleConnect}
              disabled={connecting}
              data-testid="button-backup-connect"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4 mr-2" />
              )}
              Connect to OneDrive
            </Button>
            <div className="text-xs text-muted-foreground mt-2">
              Opens the Microsoft sign-in page. After you approve, FacilityTrack
              will back up your database to OneDrive every day.
            </div>
          </div>
        )}

        {/* Folder/hour editor (no credential fields any more) */}
        {showSettings && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Folder</Label>
                <div className="flex gap-2">
                  <Input
                    value={targetFolder}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    data-testid="input-backup-folder"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={!s.configured}
                    title={
                      s.configured
                        ? "Browse your OneDrive folders"
                        : "Connect to OneDrive first to browse folders"
                    }
                    data-testid="button-backup-choose-folder"
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1" />
                    Choose…
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Hour (0-23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(Number(e.target.value))}
                  data-testid="input-backup-hour"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                data-testid="button-backup-save"
              >
                Save
              </Button>
            </div>
          </div>
        )}

        <OneDriveFolderPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          initialPath={targetFolder}
          onSelect={(path) => setTargetFolder(path)}
        />
      </CardContent>
    </Card>
  );
}
