# FacilityTrack Desktop (Electron wrapper)

This artifact wraps the FacilityTrack web app — `@workspace/facilitytrack`
(React frontend) and `@workspace/api-server` (Express + SQLite backend) — as
a single Windows desktop application with auto-update.

## How it works

1. **Single executable.** Electron's main process boots the Express backend
   in-process via `@workspace/api-server/embed#startServer` on a random free
   loopback port (`127.0.0.1:0`). It then opens a `BrowserWindow` pointed at
   `http://127.0.0.1:<port>/`. The same Express server hands out the React
   bundle and the JSON API, so the frontend behaves exactly like the web
   build.
2. **SQLite lives in `%APPDATA%`.** The DB path is set by the main process
   to `app.getPath("userData") + "/facilitytrack.sqlite"`. Migrations from
   `lib/db/drizzle/` are applied automatically on first connect (handled by
   `lib/db/src/index.ts#getDb`).
3. **Licence gate.** The shipped app uses the existing `LicenseGate` /
   `requireValidLicense` flow against the customer's licence server (set
   `LICENSE_SERVER_URL` at build time, or fall back to the production URL
   baked into `src/main.ts`).
4. **OneDrive backup.** A nightly scheduler in
   `artifacts/api-server/src/lib/backup.ts` copies the SQLite file to the
   customer's OneDrive via the Microsoft Graph API. The customer configures
   their Azure AD `clientId` + `refreshToken` from
   **Settings → OneDrive Backup**. Backups have 3-attempt retry with
   exponential backoff; the last status is shown in the same card.
5. **Auto-update.** `electron-updater` checks the configured generic feed
   shortly after startup and every 4h; downloaded updates install on quit.

## Layout

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Electron main process — boots embedded server, opens window, wires updater |
| `src/preload.ts` | Renderer ↔ main bridge (currently exposes `window.facilityTrackDesktop`) |
| `build.mjs` | esbuild bundler for main + preload → `dist/` |
| `electron-builder.yml` | NSIS installer + auto-updater config |
| `dev-update.yml` | Dev-mode updater feed pointer |
| `assets/icon.ico` | Windows installer/app icon (place yours here) |

## Commands

```bash
# One-shot dev cycle (builds frontend + api-server + main, then launches Electron)
pnpm --filter @workspace/desktop run dev

# Just rebuild the main process (after changing src/main.ts)
pnpm --filter @workspace/desktop run build

# Build a signed NSIS installer for Windows (runs on Windows hosts; cross-build
# from Linux requires Wine + nsis). Local dev builds are unsigned unless the
# WIN_CSC_LINK_B64 / WIN_CSC_KEY_PASSWORD env vars are present — see
# `Code signing` below.
pnpm --filter @workspace/desktop run dist:win

# Same, but ALSO instructs electron-builder to publish to the provider
# configured in electron-builder.yml. Currently the provider is `generic`
# (download-only) so this is effectively a no-op for uploading — customer
# releases are published by the GitHub Actions workflow, not from a
# developer's laptop. See `Releasing a new version` below.
pnpm --filter @workspace/desktop run dist:win:publish
```

## Configuring OneDrive backup

Customers click **Settings → OneDrive Backup → Connect to OneDrive**. The
desktop app then:

1. Asks Microsoft for an OAuth 2.0 device code (against the FacilityTrack
   Azure AD app registration baked into the build).
2. Opens <https://microsoft.com/devicelogin> in the user's default browser
   and shows them the short user code to type in.
3. Polls Microsoft in the background until the user approves, then writes
   the resulting refresh token straight into the local `backup_state`
   table. The renderer never sees the token.

That's it — no Azure portal, no MSAL sample, no copy-pasting GUIDs.

The refresh token is stored in the local SQLite DB and never leaves the
machine except when calling `login.microsoftonline.com` to mint a fresh
access token. Microsoft sometimes rotates the refresh token — when that
happens the new value is persisted automatically.

### Azure AD client ID

The build embeds a single multi-tenant Azure AD app registration with the
delegated `Files.ReadWrite` and `offline_access` scopes. The client ID
lives in `src/main.ts` and can be overridden at build time via the
`FACILITYTRACK_AZURE_CLIENT_ID` env var (handy for staging / self-hosted
forks):

```bash
FACILITYTRACK_AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000 \
  pnpm --filter @workspace/desktop run dist:win
```

If the placeholder client ID is left in place, the **Connect to OneDrive**
button surfaces a clear error rather than opening a broken Microsoft sign-in
page.

## Code signing

The Windows installer is signed with an EV (or OV) code-signing certificate
so customers don't see a SmartScreen "Windows protected your PC" warning.
The signing wiring lives in `electron-builder.yml` (`win.certificateFile` /
`win.certificatePassword` / `win.signingHashAlgorithms`) and is fed by
`scripts/sign-and-build.mjs`, which both `dist:win` and `dist:win:publish`
go through.

### Required env vars

| Var | Purpose |
| --- | --- |
| `WIN_CSC_LINK_B64` | Base64-encoded PFX (`.pfx`) export of the certificate + private key. Stored as a CI secret. |
| `WIN_CSC_KEY_PASSWORD` | Password that protects the PFX. Stored as a CI secret. |
| `CI` | Set to `true` in GitHub Actions / build pipelines. The wrapper refuses to produce an unsigned installer when `CI=true`. |

The wrapper decodes `WIN_CSC_LINK_B64` to a temporary `.pfx` file (mode
`0600`), exports `WIN_CSC_FILE` so the YAML's `${env.WIN_CSC_FILE}`
substitution resolves to that path, runs `electron-builder`, and deletes
the temp file on exit (including signal-based termination). When the env
vars are unset and you're **not** in CI, an unsigned installer is produced
with a loud warning — useful for local smoke tests.

### Encoding the cert for CI

On the machine where you exported the PFX from the HSM / token / CA
portal:

```bash
# Linux / macOS
base64 -w0 facilitytrack-codesign.pfx > facilitytrack-codesign.pfx.b64
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("facilitytrack-codesign.pfx")) `
  | Out-File -NoNewline facilitytrack-codesign.pfx.b64
```

Paste the contents of `facilitytrack-codesign.pfx.b64` into the GitHub
Actions secret `WIN_CSC_LINK_B64`, and the PFX password into
`WIN_CSC_KEY_PASSWORD`. Delete the local `.b64` file afterwards.

### Verifying a build is signed

The release pipeline enforces this automatically: after `electron-builder`
finishes, `scripts/sign-and-build.mjs` parses the produced `.exe`'s PE
certificate table and refuses to exit successfully unless an RFC 3161
timestamp counter-signature (OID `1.3.6.1.4.1.311.3.3.1`) is present. So
if the timestamp server (`win.rfc3161TimeStampServer` in
`electron-builder.yml`) is briefly unreachable at signing time, the build
fails fast instead of silently shipping a "time bomb" installer that
would start failing SmartScreen the day the code-signing certificate
expires. The check only runs when a real cert was supplied
(`WIN_CSC_LINK_B64` set / `CI=true` path); unsigned local dev builds
skip it.

The manual VM check below is a belt-and-braces backup for release
sign-off — run it on a clean Windows VM before announcing a release:

1. Download the installer the build pipeline produced (e.g.
   `FacilityTrack-Setup-0.1.0.exe`).
2. Right-click → **Properties → Digital Signatures**. There must be a
   `FacilityTrack Limited` (or whoever the cert is issued to) entry with
   a SHA-256 digest. Select it and click **Details** — under
   **Countersignatures** you should see an entry from the timestamp
   authority (e.g. `DigiCert Timestamp …`) with a "Date of timestamp"
   matching the build date. The counter-signature is what keeps the
   installer trusted by Windows after the code-signing certificate
   expires; if it's missing, raise a release blocker — the installer
   will silently rot and start failing SmartScreen the day the cert
   expires.
3. Run the installer. SmartScreen should either install silently or show
   the soft "More info → Run anyway" prompt the first few times (OV
   builds reputation over the first ~few thousand downloads; EV is
   trusted immediately).
4. From an elevated PowerShell:

   ```powershell
   Get-AuthenticodeSignature .\FacilityTrack-Setup-0.1.0.exe |
     Format-List Status, SignerCertificate, TimeStamperCertificate
   ```

   `Status` must be `Valid`, `SignerCertificate.Subject` must match the
   `publisherName` in `electron-builder.yml`, and
   `TimeStamperCertificate` must be populated (i.e. not `$null`) — that
   confirms the RFC 3161 counter-signature was applied.

### Rotating the certificate

Code-signing certificates expire (typically 1–3 years) and may be
re-issued early if the private key is compromised:

1. Procure a new EV/OV certificate (Sectigo, DigiCert, GlobalSign…).
   Export it as a password-protected `.pfx`.
2. Re-encode it to base64 (see above) and update the
   `WIN_CSC_LINK_B64` and `WIN_CSC_KEY_PASSWORD` GitHub Actions
   secrets. **Don't delete the previous secrets until at least one
   release has been built and verified with the new cert.**
3. If the cert's CN changed, update `win.publisherName` in
   `electron-builder.yml` to match — `verifyUpdateCodeSignature: true`
   means existing installs will refuse the auto-update otherwise. Also
   ship at least one update signed with **both** the old and new cert
   (or coordinate a manual reinstall) so customers' running copies
   transition cleanly.
4. Bump the package version, push a `desktop-v*` tag (see
   [Releasing a new version](#releasing-a-new-version)) to trigger the
   release workflow with the new cert, and verify the freshly-built
   installer's signature on a clean VM before announcing the release.
5. Securely destroy the local `.pfx` and `.b64` files.


## Releasing a new version

Releases are cut by the GitHub Actions workflow at
[`.github/workflows/desktop-release.yml`](../../.github/workflows/desktop-release.yml).
The workflow runs on `windows-latest` so `signtool` can sign natively, decodes
the PFX from `WIN_CSC_LINK_B64` via `scripts/sign-and-build.mjs`, runs
`pnpm --filter @workspace/desktop run dist:win`, attaches the resulting
`FacilityTrack-Setup-<version>.exe` + `latest.yml` (+ `.blockmap`) to a
GitHub Release, and finally pushes those same files to the customer-facing
update bucket at <https://updates.facilitytrack.co.nz/desktop> so existing
installs auto-update with no human in the loop. See [Customer update feed
(publish bucket)](#customer-update-feed-publish-bucket) below for the
required CI secrets.

The cert PFX and password live **only** in GitHub Actions secrets
(`WIN_CSC_LINK_B64`, `WIN_CSC_KEY_PASSWORD`) — no developer needs the cert on
their laptop to ship a release.

**To cut a release:**

1. Bump `version` in `artifacts/desktop/package.json` and merge to `main`.
2. Tag the commit and push the tag — the workflow keys off any tag matching
   `desktop-v*`:

   ```bash
   git tag desktop-v0.2.0
   git push origin desktop-v0.2.0
   ```

3. Watch the **Desktop Release (Windows)** run in the Actions tab. On success:
   - The signed installer + `latest.yml` are attached to the GitHub Release
     for tag `desktop-v0.2.0` (audit trail / manual rollback source).
   - The same files are retained as a workflow artifact
     (`facilitytrack-windows-installer`, 30-day retention) for ad-hoc
     download.
   - The workflow then pushes the installer, `*.blockmap` and `latest.yml`
     to the bucket backing <https://updates.facilitytrack.co.nz/desktop>.
     Customers' running copies pick up the new `latest.yml` within a few
     hours and silently install on next quit — **no manual mirroring step
     required**.

For a one-off rebuild (e.g. to verify a new cert) without cutting a tag, use
**Run workflow** on the same Actions page — the installer ends up only as a
workflow artifact, not as a published release. The publish-to-customer-feed
step is gated on a `desktop-v*` tag push, so manual rebuilds never roll out
to customers.

### Customer update feed (publish bucket)

The customer-facing URL is a stable custom domain
(<https://updates.facilitytrack.co.nz/desktop>) that fronts an S3-compatible
bucket. The `publish:` block in `electron-builder.yml` is intentionally
`generic` (download-only) so the URL baked into `app-update.yml` on every
install is the custom domain, not the bucket's own hostname — that lets us
move between AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2 or
MinIO without orphaning existing installs.

The release workflow uploads to that bucket using the AWS CLI (preinstalled
on `windows-latest`), with the following GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `DESKTOP_UPDATE_S3_BUCKET` | Bucket name (e.g. `facilitytrack-updates`). |
| `DESKTOP_UPDATE_S3_REGION` | Region — `us-east-1` for AWS, `auto` for R2, etc. |
| `DESKTOP_UPDATE_S3_ACCESS_KEY_ID` | IAM access key. Scope it to `s3:PutObject` (and `s3:PutObjectAcl` if your bucket is public-read) on the bucket — no list/delete needed. |
| `DESKTOP_UPDATE_S3_SECRET_ACCESS_KEY` | The IAM secret. |
| `DESKTOP_UPDATE_S3_ENDPOINT` | *Optional.* S3-compatible endpoint override, e.g. `https://<accountid>.r2.cloudflarestorage.com` for Cloudflare R2 or `https://<region>.digitaloceanspaces.com` for Spaces. Leave unset for AWS S3. |
| `DESKTOP_UPDATE_S3_PREFIX` | *Optional.* Key prefix inside the bucket. Defaults to `desktop` (so keys land at `s3://<bucket>/desktop/...`, matching the `/desktop` path on the customer URL). Set to `/` to disable the prefix entirely (e.g. when the bucket is dedicated to the desktop feed). |

**Upload order matters** and is enforced by the workflow: versioned
`*.exe` and `*.blockmap` files are uploaded first with a year-long
immutable cache, then `latest.yml` is uploaded last with `no-cache`
headers. That way a half-uploaded release can never advertise an installer
that isn't fully there yet, and the next client poll picks up the new
version immediately rather than waiting for a CDN cache to expire.

If the bucket is fronted by Cloudflare or another CDN, no extra cache
purge step is needed — the `Cache-Control: no-cache, no-store,
must-revalidate` header on `latest.yml` instructs the CDN not to cache the
manifest at the edge.
