#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const __dirname = dirname(fileURLToPath(import.meta.url));

const certB64 = process.env.WIN_CSC_LINK_B64?.trim();
const certPass = process.env.WIN_CSC_KEY_PASSWORD;
const isCI = process.env.CI === "true" || process.env.CI === "1";
// Escape hatch for "test build" runs (e.g. internal QA on a single
// machine before a code-signing certificate has been procured). When set
// to a truthy value the wrapper will allow an unsigned build to proceed
// even under CI=true. The resulting installer triggers a SmartScreen
// warning on launch and MUST NOT be shipped to customers — the
// downstream "Publish installer to customer update feed" step is gated
// on a `desktop-v*` tag push, not on workflow_dispatch, so manual
// unsigned builds cannot reach customers via this pipeline.
const allowUnsigned =
  process.env.ALLOW_UNSIGNED === "true" || process.env.ALLOW_UNSIGNED === "1";

let tempDir = null;
let signedRelease = false;
const cleanup = () => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    tempDir = null;
  }
};

if (certB64 && certB64.length > 0) {
  if (!certPass) {
    console.error(
      "[sign-and-build] WIN_CSC_LINK_B64 is set but WIN_CSC_KEY_PASSWORD is empty. Refusing to build.",
    );
    process.exit(1);
  }

  let pfxBuffer;
  try {
    pfxBuffer = Buffer.from(certB64, "base64");
  } catch (err) {
    console.error("[sign-and-build] Failed to base64-decode WIN_CSC_LINK_B64:", err);
    process.exit(1);
  }
  if (pfxBuffer.length < 100) {
    console.error(
      "[sign-and-build] Decoded certificate is suspiciously small (",
      pfxBuffer.length,
      "bytes). Aborting.",
    );
    process.exit(1);
  }

  tempDir = mkdtempSync(join(tmpdir(), "ft-codesign-"));
  const certPath = join(tempDir, "cert.pfx");
  writeFileSync(certPath, pfxBuffer, { mode: 0o600 });
  // electron-builder reads `WIN_CSC_LINK` (path or base64) and
  // `WIN_CSC_KEY_PASSWORD` natively — no `certificateFile:` field in
  // electron-builder.yml is required. We use the env-var route because
  // declaring `certificateFile: ${env.WIN_CSC_FILE}` in the YAML forces
  // electron-builder to attempt signing even when the env var is empty
  // (e.g. ALLOW_UNSIGNED=1), which fails with
  // "Please specify pkcs12 (.p12/.pfx) file, ${env.WIN_CSC_FILE} is not correct".
  //
  // Defensive cleanup: clear any pre-existing global cert env vars on the
  // runner before installing our own. electron-builder also recognises the
  // legacy `CSC_LINK` / `CSC_KEY_PASSWORD` names — if a self-hosted runner
  // (or an unrelated workflow earlier in the same job) had those exported,
  // they could shadow or conflict with the per-build values we're about to
  // set. GitHub-hosted runners don't have these set, but this guards against
  // the day someone migrates to self-hosted infra.
  delete process.env.CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  delete process.env.WIN_CSC_FILE;
  process.env.WIN_CSC_LINK = certPath;
  process.env.WIN_CSC_KEY_PASSWORD = certPass;
  signedRelease = true;
  console.log(
    `[sign-and-build] Decoded code-signing certificate (${pfxBuffer.length} bytes) to ${certPath}; exported WIN_CSC_LINK.`,
  );
} else if (isCI && !allowUnsigned) {
  console.error(
    "[sign-and-build] WIN_CSC_LINK_B64 is not set in CI. Refusing to build an unsigned release installer.",
  );
  console.error(
    "[sign-and-build] (Set ALLOW_UNSIGNED=1 to build an unsigned TEST installer — never use this for customer releases.)",
  );
  process.exit(1);
} else {
  if (isCI && allowUnsigned) {
    console.warn(
      "[sign-and-build] ALLOW_UNSIGNED is set in CI; producing UNSIGNED test installer. " +
        "This installer will trigger SmartScreen warnings and MUST NOT be distributed to customers.",
    );
  } else {
    console.warn(
      "[sign-and-build] WIN_CSC_LINK_B64 is not set; building UNSIGNED installer (local dev only).",
    );
  }
  // CRITICAL: do NOT set WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD / WIN_CSC_FILE
  // here. electron-builder treats any non-empty cert env var (or any
  // `certificateFile`/`certificatePassword` field in electron-builder.yml)
  // as "user wants signing" and will invoke signtool. With nothing set it
  // logs "skipped, .pfx certificate is not specified" and continues
  // packaging an unsigned installer — which is exactly what we want for
  // ALLOW_UNSIGNED test builds and local dev. Defensively unset any
  // pre-existing values so a stale env var from the runner can't trip us up.
  delete process.env.WIN_CSC_LINK;
  delete process.env.WIN_CSC_FILE;
  delete process.env.CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  delete process.env.WIN_CSC_KEY_PASSWORD;
}

const child = spawn("electron-builder", args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

const onExitSignal = (signal) => {
  cleanup();
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => onExitSignal("SIGINT"));
process.on("SIGTERM", () => onExitSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code === 0 && signedRelease) {
    try {
      verifyAllReleaseInstallers();
    } catch (err) {
      console.error(`[sign-and-build] ${err.message ?? err}`);
      process.exit(1);
    }
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  cleanup();
  console.error("[sign-and-build] Failed to spawn electron-builder:", err);
  process.exit(1);
});

// --- RFC 3161 timestamp counter-signature verification --------------------
//
// electron-builder shells out to signtool (or `osslsigncode` on non-Windows
// hosts) and passes `rfc3161TimeStampServer` from electron-builder.yml. If
// the timestamp server is briefly unreachable at signing time the underlying
// signer can still produce a valid Authenticode signature — just without a
// counter-signature. That installer would work fine today and silently start
// failing SmartScreen the day the code-signing certificate expires (months
// or years after the release).
//
// To prevent that we parse the produced `.exe`'s PE headers directly, locate
// the WIN_CERTIFICATE table (Optional Header data directory entry #4), and
// scan it for the szOID_RFC3161_counterSign OID (1.3.6.1.4.1.311.3.3.1).
// If the OID is absent the build is failed. We avoid shelling out to
// signtool/osslsigncode here so the check works the same on Windows runners,
// Linux+Wine cross-builds, and macOS dev machines.

const RFC3161_OID_BYTES = Buffer.from([
  0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0x37, 0x03, 0x03, 0x01,
]);

function verifyAllReleaseInstallers() {
  const releaseDir = resolve(__dirname, "..", "release");
  let entries;
  try {
    entries = readdirSync(releaseDir);
  } catch (err) {
    throw new Error(
      `Cannot read release directory ${releaseDir} to verify counter-signature: ${err.message ?? err}`,
    );
  }
  const exes = entries
    .filter((name) => /\.exe$/i.test(name))
    .map((name) => join(releaseDir, name));
  if (exes.length === 0) {
    throw new Error(
      `No .exe installer found in ${releaseDir}; cannot verify RFC 3161 counter-signature.`,
    );
  }
  const failures = [];
  for (const exe of exes) {
    let result;
    try {
      result = inspectAuthenticodeSignature(exe);
    } catch (err) {
      failures.push(`${exe}: failed to parse PE — ${err.message ?? err}`);
      continue;
    }
    if (!result.signed) {
      failures.push(
        `${exe}: no Authenticode signature found (${result.reason}). Did electron-builder skip signing?`,
      );
      continue;
    }
    if (!result.timestamped) {
      failures.push(
        `${exe}: Authenticode signature is present but the RFC 3161 timestamp counter-signature is MISSING. ` +
          "The timestamp server (see win.rfc3161TimeStampServer in electron-builder.yml) was likely unreachable at signing time. " +
          "This installer would silently start failing SmartScreen the day the code-signing certificate expires — refusing to ship it.",
      );
      continue;
    }
    console.log(
      `[sign-and-build] ${exe}: RFC 3161 timestamp counter-signature verified.`,
    );
  }
  if (failures.length > 0) {
    for (const msg of failures) {
      console.error(`[sign-and-build] ${msg}`);
    }
    throw new Error(
      `Counter-signature verification failed for ${failures.length} installer(s).`,
    );
  }
}

function inspectAuthenticodeSignature(exePath) {
  const fd = openSync(exePath, "r");
  try {
    const fileSize = statSync(exePath).size;

    const dos = Buffer.alloc(64);
    if (readSync(fd, dos, 0, 64, 0) < 64) {
      throw new Error("file is shorter than a DOS header");
    }
    if (dos[0] !== 0x4d || dos[1] !== 0x5a) {
      throw new Error("not a PE file (missing 'MZ' magic)");
    }
    const peOffset = dos.readUInt32LE(60);

    const peSig = Buffer.alloc(4);
    readSync(fd, peSig, 0, 4, peOffset);
    if (
      !(peSig[0] === 0x50 && peSig[1] === 0x45 && peSig[2] === 0 && peSig[3] === 0)
    ) {
      throw new Error("missing 'PE\\0\\0' signature at e_lfanew");
    }

    const coff = Buffer.alloc(20);
    readSync(fd, coff, 0, 20, peOffset + 4);
    const sizeOfOptionalHeader = coff.readUInt16LE(16);
    if (sizeOfOptionalHeader < 96) {
      throw new Error(
        `optional header is too small (${sizeOfOptionalHeader} bytes) to contain data directories`,
      );
    }

    const optHeader = Buffer.alloc(sizeOfOptionalHeader);
    readSync(fd, optHeader, 0, sizeOfOptionalHeader, peOffset + 24);
    const magic = optHeader.readUInt16LE(0);
    // PE32 = 0x10b, PE32+ (64-bit) = 0x20b. Data directories start at
    // offset 96 in PE32, 112 in PE32+. The Certificate Table is index 4
    // (8 bytes per entry: 4-byte offset + 4-byte size).
    const dataDirBase = magic === 0x20b ? 112 : 96;
    const certEntryOffset = dataDirBase + 4 * 8;
    if (certEntryOffset + 8 > sizeOfOptionalHeader) {
      return {
        signed: false,
        timestamped: false,
        reason: "optional header doesn't include the certificate-table data directory",
      };
    }
    // Per the PE spec, the Certificate Table directory entry stores a
    // *file offset* (not an RVA) — this is the one exception in the
    // data-directory layout.
    const certOffset = optHeader.readUInt32LE(certEntryOffset);
    const certSize = optHeader.readUInt32LE(certEntryOffset + 4);
    if (certOffset === 0 || certSize === 0) {
      return {
        signed: false,
        timestamped: false,
        reason: "certificate table is empty",
      };
    }
    if (certOffset + certSize > fileSize) {
      throw new Error(
        `certificate table (offset ${certOffset}, size ${certSize}) extends past EOF (${fileSize})`,
      );
    }

    const certData = Buffer.alloc(certSize);
    readSync(fd, certData, 0, certSize, certOffset);

    return {
      signed: true,
      timestamped: certData.indexOf(RFC3161_OID_BYTES) !== -1,
    };
  } finally {
    closeSync(fd);
  }
}
