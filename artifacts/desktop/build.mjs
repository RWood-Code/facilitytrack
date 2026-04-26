/**
 * Bundles the Electron main + preload processes into `dist/`.
 *
 * The main process imports the embedded Express server from
 * `@workspace/api-server` (built separately by `build:renderer`). We let the
 * api-server bundle stay external so we don't double-bundle Express, Drizzle,
 * better-sqlite3, etc. — Electron's Node runtime pulls them straight from
 * `node_modules`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "dist");

await rm(distDir, { recursive: true, force: true });

const shared = {
  platform: "node",
  bundle: true,
  format: "cjs",
  target: "node20",
  outdir: distDir,
  logLevel: "info",
  // Native modules and packages we want resolved from node_modules at runtime
  external: [
    "electron",
    "electron-updater",
    "electron-log",
    "better-sqlite3",
    "*.node",
    // The api-server is published as a workspace package — we require it from
    // the bundled CJS at runtime via Node resolution.
    "@workspace/api-server",
    "@workspace/db",
  ],
  sourcemap: "linked",
};

await esbuild({
  ...shared,
  entryPoints: [path.resolve(here, "src/main.ts")],
});

await esbuild({
  ...shared,
  entryPoints: [path.resolve(here, "src/preload.ts")],
});
