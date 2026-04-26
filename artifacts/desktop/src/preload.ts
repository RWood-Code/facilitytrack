/**
 * Renderer ↔ main bridge.
 *
 * Exposes a small, typed surface on `window.facilityTrackDesktop`:
 *
 *   - `isDesktop`/`platform`/`versions`: lets the renderer detect that it's
 *     running inside the Electron shell (vs. a plain browser tab).
 *   - `ping()`: trivial healthcheck used in places like the footer.
 *   - `startOneDriveConnect()` / `cancelOneDriveConnect()` /
 *     `onOneDriveConnectEvent()`: drives the OneDrive device-code OAuth
 *     flow handled by the main process. The renderer only sees the user
 *     code and a sequence of progress events — it never touches the
 *     refresh token, which is written straight into `backup_state` by
 *     main.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

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

contextBridge.exposeInMainWorld("facilityTrackDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: process.versions,
  ping: () => ipcRenderer.invoke("desktop:ping"),

  /**
   * Kick off the OneDrive device-code flow. The default browser opens to
   * the Microsoft sign-in page; the returned `userCode` is what the user
   * types there. Subscribe to `onOneDriveConnectEvent` for the result.
   */
  startOneDriveConnect: (): Promise<OneDriveConnectStartResult> =>
    ipcRenderer.invoke("desktop:onedrive-connect"),

  /** Abort an in-flight device-code flow (e.g. user closed the modal). */
  cancelOneDriveConnect: (): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke("desktop:onedrive-cancel"),

  /**
   * Subscribe to progress events from an in-flight connect flow. Returns
   * an unsubscribe function that the renderer should call when its UI
   * unmounts so we don't leak listeners.
   */
  onOneDriveConnectEvent: (
    handler: (event: OneDriveConnectEvent) => void,
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, event: OneDriveConnectEvent) =>
      handler(event);
    ipcRenderer.on("desktop:onedrive-connect-event", listener);
    return () => {
      ipcRenderer.removeListener("desktop:onedrive-connect-event", listener);
    };
  },
});
