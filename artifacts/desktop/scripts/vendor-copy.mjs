/**
 * vendor-copy.mjs
 *
 * Copies built workspace outputs into artifacts/desktop/vendor/ so that
 * electron-builder only ever sees files inside the desktop folder. This
 * avoids the "must be under artifacts/desktop/" error that occurs when
 * electron-builder tries to follow pnpm workspace symlinks to sibling
 * packages (api-server, facilitytrack, lib/db).
 *
 * Called automatically as part of the dist:win and dist:win:publish scripts
 * in package.json — runs after build:all AND after rebuild:electron, so the
 * better-sqlite3 binary in desktop/node_modules is already rebuilt for
 * Electron's ABI by the time we override the api-server's vendored copy
 * with it (see "ABI override" step below).
 */

import { cpSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const root = resolve(desktop, "..", "..");

const copies = [
  {
    label: "api-server dist",
    src: resolve(root, "artifacts", "api-server", "dist"),
    dst: resolve(desktop, "vendor", "api-server"),
  },
  {
    label: "api-server node_modules",
    src: resolve(root, "artifacts", "api-server", "node_modules"),
    dst: resolve(desktop, "vendor", "api-server", "node_modules"),
  },
  {
    label: "facilitytrack dist/public",
    src: resolve(root, "artifacts", "facilitytrack", "dist", "public"),
    dst: resolve(desktop, "vendor", "facilitytrack", "dist", "public"),
  },
  {
    label: "db drizzle migrations",
    src: resolve(root, "lib", "db", "drizzle"),
    dst: resolve(desktop, "vendor", "db", "drizzle"),
  },
];

let allOk = true;

for (const { label, src, dst } of copies) {
  if (!existsSync(src)) {
    console.error(`[vendor-copy] ERROR: source not found for ${label}: ${src}`);
    console.error(`[vendor-copy] Make sure build:all ran successfully before this step.`);
    allOk = false;
    continue;
  }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  console.log(`[vendor-copy] ${label}: ${src} → ${dst}`);
}

if (!allOk) {
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ABI override: replace api-server's vendored better-sqlite3 with the
// Electron-rebuilt copy from desktop/node_modules.
// ---------------------------------------------------------------------------
//
// embed.mjs (the bundled api-server entry point) does
// `import Database from "better-sqlite3"`. At runtime its location is
// `<resources>/api-server/dist/embed.mjs`, so Node's module resolver finds
// the *vendored* copy first at
// `<resources>/api-server/dist/node_modules/better-sqlite3/`. That copy was
// installed by pnpm against Node's ABI on the GitHub windows-latest runner;
// loading it inside Electron throws a NODE_MODULE_VERSION mismatch the moment
// the app boots.
//
// `desktop/node_modules/better-sqlite3` IS rebuilt for Electron's ABI by the
// `rebuild:electron` script (which runs immediately before vendor:copy in the
// dist:win pipeline — see package.json). Overwrite the vendored copy with it
// here so the binary that ships in the installer matches Electron's ABI.
const desktopBsq = resolve(desktop, "node_modules", "better-sqlite3");
const vendorBsq = resolve(
  desktop,
  "vendor",
  "api-server",
  "node_modules",
  "better-sqlite3",
);

if (!existsSync(desktopBsq)) {
  console.error(
    `[vendor-copy] ERROR: desktop/node_modules/better-sqlite3 not found at ${desktopBsq}.`,
  );
  console.error(
    "[vendor-copy] Run `pnpm install` and `pnpm run rebuild:electron` first.",
  );
  process.exit(1);
}

rmSync(vendorBsq, { recursive: true, force: true });
cpSync(desktopBsq, vendorBsq, {
  recursive: true,
  dereference: true,
  force: true,
});
console.log(
  `[vendor-copy] better-sqlite3 ABI override: ${desktopBsq} → ${vendorBsq}`,
);

console.log("[vendor-copy] All vendor copies complete.");
