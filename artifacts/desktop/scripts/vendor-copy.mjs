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
 * in package.json — runs after build:all, before electron-builder.
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
  cpSync(src, dst, { recursive: true });
  console.log(`[vendor-copy] ${label}: ${src} → ${dst}`);
}

if (!allOk) {
  process.exit(1);
}

console.log("[vendor-copy] All vendor copies complete.");
