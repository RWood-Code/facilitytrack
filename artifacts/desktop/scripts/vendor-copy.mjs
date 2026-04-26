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

// ---------------------------------------------------------------------------
// Transitive runtime deps of better-sqlite3.
// ---------------------------------------------------------------------------
//
// better-sqlite3's lib/database.js does `require('bindings')` to locate its
// compiled .node file. In pnpm's layout `bindings` lives at
// node_modules/.pnpm/better-sqlite3@.../node_modules/bindings — i.e. it is a
// sibling of better-sqlite3 inside its private virtual store, NOT a member
// of artifacts/api-server/node_modules. The symlink-following copy above
// only brings the better-sqlite3 directory across, so the installed app
// crashes the first time getDb() runs with `Cannot find module 'bindings'`.
//
// `bindings` itself depends on `file-uri-to-path` at runtime, so we must
// copy that across too. We deliberately skip `prebuild-install`, which is
// only used by `npm install` to download a prebuilt binary — never invoked
// at runtime.
//
// Place both packages directly inside vendor/api-server/node_modules/ as
// siblings of better-sqlite3. Node's resolver then walks up from
// better-sqlite3/lib/database.js and finds them on the very first lookup.
const vendorApiNodeModules = resolve(desktop, "vendor", "api-server", "node_modules");
const transitiveDeps = ["bindings", "file-uri-to-path"];

for (const dep of transitiveDeps) {
  // Find the package inside .pnpm. Glob via a fs.readdirSync since the
  // version-pinned folder name (`bindings@1.5.0`) changes when deps are
  // bumped — we don't want to hard-code versions in two places.
  const pnpmRoot = resolve(root, "node_modules", ".pnpm");
  const { readdirSync } = await import("node:fs");
  let entries = [];
  try {
    entries = readdirSync(pnpmRoot, { withFileTypes: true });
  } catch (err) {
    console.error(
      `[vendor-copy] ERROR: cannot read pnpm store at ${pnpmRoot}: ${err.message}`,
    );
    process.exit(1);
  }
  const match = entries.find(
    (e) =>
      e.isDirectory() &&
      (e.name === dep || e.name.startsWith(`${dep}@`)),
  );
  if (!match) {
    console.error(
      `[vendor-copy] ERROR: could not find ${dep} in ${pnpmRoot}. ` +
        "Run `pnpm install` to materialise it.",
    );
    process.exit(1);
  }
  const src = resolve(pnpmRoot, match.name, "node_modules", dep);
  const dst = resolve(vendorApiNodeModules, dep);
  if (!existsSync(src)) {
    console.error(`[vendor-copy] ERROR: ${dep} package missing at ${src}`);
    process.exit(1);
  }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true, dereference: true, force: true });
  console.log(`[vendor-copy] better-sqlite3 dep ${dep}: ${src} → ${dst}`);
}

console.log("[vendor-copy] All vendor copies complete.");
