/**
 * FacilityTrack — Electron main process.
 *
 * Boots the embedded Express backend in-process (via
 * `@workspace/api-server/embed`), then opens a single BrowserWindow that
 * loads the React frontend served by that same backend on a random free
 * local port.
 *
 * The SQLite database lives at `<userData>/facilitytrack.sqlite` so the
 * customer's data follows their Windows user account, not the install
 * directory.
 *
 * On Windows builds, `electron-updater` checks the configured release feed
 * shortly after launch and silently downloads any new version, prompting on
 * next quit.
 */

import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

// ---------------------------------------------------------------------------
// Embedded API server module loader.
//
// In dev (`pnpm run dev`), the api-server is reachable via the pnpm
// workspace symlink at `node_modules/@workspace/api-server` and we just
// `import("@workspace/api-server/embed")`.
//
// In a packaged installer (`app.isPackaged === true`), the workspace
// symlink does NOT exist — `@workspace/api-server` and `@workspace/db`
// are declared as `devDependencies` precisely so electron-builder leaves
// them out of the asar (otherwise it tries to follow the symlink and
// trips on files outside `artifacts/desktop/`, e.g. `.replit-artifact/`).
// Instead, the bundled `embed.mjs` produced by api-server's esbuild step
// is copied into `extraResources` at `<resourcesPath>/api-server/dist/`
// by `scripts/vendor-copy.mjs`, and we load it via an absolute file URL.
//
// The file URL is required (not a bare path) because dynamic `import()`
// of an absolute Windows path like `C:\…\embed.mjs` is rejected by Node
// as not a valid module specifier.
// ---------------------------------------------------------------------------

type EmbedModule = typeof import("@workspace/api-server/embed");

async function loadEmbedModule(): Promise<EmbedModule> {
  if (app.isPackaged) {
    const embedPath = path.join(
      process.resourcesPath,
      "api-server",
      "dist",
      "embed.mjs",
    );
    return (await import(pathToFileURL(embedPath).href)) as EmbedModule;
  }
  return (await import("@workspace/api-server/embed")) as EmbedModule;
}

// ---------------------------------------------------------------------------
// Azure AD app registration baked into the desktop build.
//
// FacilityTrack ships a single Azure AD multi-tenant app registration with
// the delegated `Files.ReadWrite` and `offline_access` scopes. Customers
// don't need to create their own — they just click "Connect to OneDrive"
// in Settings, which kicks off the OAuth 2.0 device-code flow handled by
// `desktop:onedrive-connect` below.
//
// The Client ID can be overridden at build time via the
// `FACILITYTRACK_AZURE_CLIENT_ID` env var (useful for staging or self-hosted
// builds). If the placeholder is left in place the IPC handler returns a
// helpful error instead of opening a broken Microsoft login page.
// ---------------------------------------------------------------------------

const AZURE_CLIENT_ID_PLACEHOLDER = "REPLACE_WITH_FACILITYTRACK_AZURE_APP_ID";
const AZURE_CLIENT_ID =
  process.env.FACILITYTRACK_AZURE_CLIENT_ID?.trim() ||
  AZURE_CLIENT_ID_PLACEHOLDER;
const AZURE_TENANT = "common";
const AZURE_SCOPES = "Files.ReadWrite offline_access";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

log.transports.file.level = "info";
log.info(`FacilityTrack desktop ${app.getVersion()} starting (${process.platform})`);
autoUpdater.logger = log;

// ---------------------------------------------------------------------------
// Single-instance lock — second double-click focuses the existing window.
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.info("Another instance is already running — exiting");
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getDbPath(): string {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "facilitytrack.sqlite");
}

function getStaticFilesPath(): string | null {
  // In dev (running from `dist/` inside the repo) the frontend lives at
  // `../facilitytrack/dist/public`. In a packaged build (`app.asar`) the
  // frontend is copied into `resources/app/artifacts/facilitytrack/dist/public`
  // by electron-builder's `extraResources` rules.
  const candidates = [
    path.resolve(__dirname, "../../facilitytrack/dist/public"),
    path.resolve(process.resourcesPath ?? "", "facilitytrack/dist/public"),
    path.resolve(app.getAppPath(), "artifacts/facilitytrack/dist/public"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function getMigrationsPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../../lib/db/drizzle"),
    path.resolve(process.resourcesPath ?? "", "lib/db/drizzle"),
    path.resolve(app.getAppPath(), "lib/db/drizzle"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningServer | null = null;

async function startEmbeddedServer(): Promise<RunningServer> {
  const dbPath = getDbPath();
  const staticPath = getStaticFilesPath();
  const migrationsPath = getMigrationsPath();

  // The Express app reads these at import time, so they must be set first.
  process.env.NODE_ENV = "production";
  process.env.FACILITYTRACK_DB_PATH = dbPath;
  if (staticPath) process.env.STATIC_FILES_PATH = staticPath;
  if (migrationsPath) process.env.FACILITYTRACK_MIGRATIONS_PATH = migrationsPath;
  if (!process.env.SESSION_SECRET) {
    // Stable per-machine secret derived from the Windows user data folder.
    process.env.SESSION_SECRET = crypto
      .createHash("sha256")
      .update(`${app.getPath("userData")}|facilitytrack-desktop`)
      .digest("hex");
  }
  if (!process.env.LICENSE_SERVER_URL) {
    process.env.LICENSE_SERVER_URL =
      "https://facilitytrack-license.replit.app/license-server";
  }
  // The embedded api-server binds plain http://127.0.0.1:<random-port>; with
  // NODE_ENV=production it would otherwise issue Secure cookies that the
  // renderer's HTTP origin can never send back, so /auth/me returns 401
  // immediately after a successful POST /auth/login and the UI bounces
  // back to the sign-in screen. Loopback-only listener → safe to opt out.
  process.env.FACILITYTRACK_INSECURE_COOKIES = "1";

  log.info({ dbPath, staticPath, migrationsPath }, "Starting embedded API server");

  const mod = await loadEmbedModule();
  const server = await mod.startServer({
    host: "127.0.0.1",
    port: 0, // free port
    dbPath,
    // Seed the demo facility + default admin/manager/staff users on first
    // launch (only runs when the app_users table is empty — see
    // runSeedIfEmpty in api-server/src/lib/seed.ts). Without this, a fresh
    // installation has zero users in SQLite and the customer cannot log in.
    // The seeded admin (admin@facilitytrack.co.nz / admin123) is intended
    // as a bootstrap account: customers should create their real users in
    // Settings → Users and disable the demo accounts immediately after
    // first sign-in.
    seedDemoData: true,
  });
  log.info({ url: server.url }, "Embedded API server listening");
  return server;
}

function createWindow(targetUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b1220",
    title: "FacilityTrack",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in the user's default browser instead of a new
  // Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  void win.loadURL(targetUrl);
  return win;
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.reload(),
        },
        { type: "separator" },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates…",
          click: () => {
            autoUpdater.checkForUpdatesAndNotify().catch((err) => {
              log.warn({ err }, "Manual update check failed");
            });
          },
        },
        {
          label: "Open Logs Folder",
          click: () => {
            void shell.openPath(path.dirname(log.transports.file.getFile().path));
          },
        },
        {
          label: "About",
          click: () => {
            void dialog.showMessageBox({
              type: "info",
              title: "FacilityTrack",
              message: `FacilityTrack ${app.getVersion()}`,
              detail:
                "Aquatic facility compliance management.\n" +
                `Data folder: ${app.getPath("userData")}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater(): void {
  // electron-updater reads the publish config from the packaged app's
  // `app-update.yml` (generated by electron-builder). In dev runs there's
  // no such file, so we silently skip.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (err) => log.warn({ err }, "Auto-updater error"));
  autoUpdater.on("update-available", (info) =>
    log.info({ version: info.version }, "Update available"),
  );
  autoUpdater.on("update-downloaded", (info) =>
    log.info({ version: info.version }, "Update downloaded — will install on quit"),
  );

  // Check shortly after startup, then every 4h.
  setTimeout(() => {
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err) => log.warn({ err }, "Initial update check failed"));
  }, 10_000);
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn({ err }, "Update check failed"));
  }, 4 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (runningServer) {
    try {
      await runningServer.close();
    } catch (err) {
      log.warn({ err }, "Error closing embedded server");
    }
  }
});

// Tiny renderer ↔ main healthcheck used by the preload bridge so the React
// app can confirm it's running inside the desktop shell.
ipcMain.handle("desktop:ping", () => ({
  ok: true,
  version: app.getVersion(),
  platform: process.platform,
  userDataPath: app.getPath("userData"),
}));

// ---------------------------------------------------------------------------
// OneDrive "Connect" — Microsoft device-code OAuth 2.0 flow.
//
// The renderer calls `desktop:onedrive-connect`, which:
//   1. Asks Microsoft for a device code + verification URL.
//   2. Opens the verification URL in the user's default browser.
//   3. Returns the user code and message immediately so the UI can display
//      them while the user signs in.
//   4. Polls the token endpoint until Microsoft hands back a refresh token
//      (or until the device code expires / the user cancels).
//   5. Writes the refresh token straight into `backup_state` via the
//      embedded api-server's `configureBackup`. The folder name and
//      schedule hour from the existing row are preserved (defaults are
//      filled in if this is the first connect).
//
// Progress is reported to the renderer via
// `desktop:onedrive-connect-event` IPC events on the same window's
// webContents. The renderer can also call `desktop:onedrive-cancel` to
// abort an in-flight flow (e.g. the user closed the modal).
// ---------------------------------------------------------------------------

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface TokenSuccessResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

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

let activeConnectAbort: AbortController | null = null;

async function postForm(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal,
  });
}

function emitConnectEvent(event: OneDriveConnectEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:onedrive-connect-event", event);
}

async function pollForToken(
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  signal: AbortSignal,
): Promise<TokenSuccessResponse> {
  const deadline = Date.now() + expiresInSec * 1000;
  let intervalMs = Math.max(1, intervalSec) * 1000;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("Connect cancelled");
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal.aborted) throw new Error("Connect cancelled");

    const res = await postForm(
      `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`,
      {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: AZURE_CLIENT_ID,
        device_code: deviceCode,
      },
      signal,
    );
    if (res.ok) {
      return (await res.json()) as TokenSuccessResponse;
    }
    const body = (await res.json().catch(() => ({}))) as TokenErrorResponse;
    switch (body.error) {
      case "authorization_pending":
        emitConnectEvent({ type: "pending" });
        continue;
      case "slow_down":
        intervalMs += 5000;
        emitConnectEvent({ type: "pending" });
        continue;
      case "authorization_declined":
        throw new Error("You declined the sign-in request in your browser.");
      case "expired_token":
        throw new Error(
          "The sign-in code expired before you finished. Please try again.",
        );
      case "bad_verification_code":
        throw new Error("Microsoft rejected the device code. Please try again.");
      default:
        throw new Error(
          body.error_description ||
            body.error ||
            `Microsoft token endpoint returned ${res.status}`,
        );
    }
  }
  throw new Error(
    "The sign-in code expired before you finished. Please try again.",
  );
}

async function persistRefreshToken(refreshToken: string): Promise<string> {
  const mod = await loadEmbedModule();
  const existing = await mod.getBackupState();
  await mod.configureBackup({
    clientId: AZURE_CLIENT_ID,
    tenantId: AZURE_TENANT,
    refreshToken,
    targetFolder: existing.targetFolder || "FacilityTrack/Backups",
    scheduleHour:
      typeof existing.scheduleHour === "number" ? existing.scheduleHour : 2,
  });
  return existing.targetFolder || "FacilityTrack/Backups";
}

ipcMain.handle(
  "desktop:onedrive-connect",
  async (): Promise<OneDriveConnectStartResult> => {
    if (AZURE_CLIENT_ID === AZURE_CLIENT_ID_PLACEHOLDER) {
      throw new Error(
        "OneDrive connect is not configured in this build. Please contact " +
          "FacilityTrack support — the desktop installer is missing its " +
          "Azure AD client ID.",
      );
    }

    // Cancel any previous in-flight flow so a second click doesn't leave
    // an orphaned poller running.
    if (activeConnectAbort) {
      activeConnectAbort.abort();
    }
    const abort = new AbortController();
    activeConnectAbort = abort;

    const codeRes = await postForm(
      `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/devicecode`,
      { client_id: AZURE_CLIENT_ID, scope: AZURE_SCOPES },
      abort.signal,
    );
    if (!codeRes.ok) {
      activeConnectAbort = null;
      const text = await codeRes.text();
      throw new Error(
        `Microsoft device-code request failed (${codeRes.status}): ${text}`,
      );
    }
    const code = (await codeRes.json()) as DeviceCodeResponse;

    // Open the verification URL in the user's default browser. We don't
    // await this — `shell.openExternal` resolves once the OS has handed
    // off the URL, but we want to return the user_code to the renderer
    // immediately so it can display it.
    void shell.openExternal(code.verification_uri).catch((err) => {
      log.warn({ err }, "Failed to open Microsoft sign-in page");
    });

    // Poll for a token in the background. The renderer subscribes to
    // `desktop:onedrive-connect-event` for progress and the final result.
    void (async () => {
      try {
        const token = await pollForToken(
          code.device_code,
          code.interval,
          code.expires_in,
          abort.signal,
        );
        const remoteFolder = await persistRefreshToken(token.refresh_token);
        emitConnectEvent({ type: "success", remoteFolder });
        log.info("OneDrive connect succeeded — refresh token persisted");
      } catch (err) {
        if (abort.signal.aborted) {
          emitConnectEvent({ type: "cancelled" });
          log.info("OneDrive connect cancelled");
        } else {
          const message = err instanceof Error ? err.message : String(err);
          emitConnectEvent({ type: "error", message });
          log.warn({ err }, "OneDrive connect failed");
        }
      } finally {
        if (activeConnectAbort === abort) activeConnectAbort = null;
      }
    })();

    return {
      userCode: code.user_code,
      verificationUri: code.verification_uri,
      expiresIn: code.expires_in,
      message: code.message,
    };
  },
);

ipcMain.handle("desktop:onedrive-cancel", () => {
  if (activeConnectAbort) {
    activeConnectAbort.abort();
    activeConnectAbort = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

app.whenReady().then(async () => {
  buildMenu();
  try {
    runningServer = await startEmbeddedServer();
    mainWindow = createWindow(runningServer.url);
  } catch (err) {
    log.error({ err }, "Fatal startup error");
    dialog.showErrorBox(
      "FacilityTrack failed to start",
      err instanceof Error ? err.message : String(err),
    );
    app.exit(1);
    return;
  }

  if (app.isPackaged) {
    setupAutoUpdater();
  }
});
