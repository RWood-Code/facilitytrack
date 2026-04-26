import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// PORT is only meaningful for `vite` / `vite preview` (the dev and preview
// servers). For `vite build` (which is what the desktop CI build runs on
// Windows) it isn't used at all. Same shape for BASE_PATH: only the build
// output's asset base URL needs it, and the desktop installer serves the
// renderer at `/` so `/` is the right default. Enforcing both with `throw`
// at module-load time makes the config un-buildable in any environment
// that doesn't pre-set them (CI, packaging steps, etc.) — defer the
// enforcement to the commands that actually need them.
function readPort(): number | null {
  const raw = process.env.PORT;
  if (!raw) return null;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT value: "${raw}"`);
  }
  return parsed;
}

function requirePortFor(command: string): number {
  const port = readPort();
  if (port === null) {
    throw new Error(
      `PORT environment variable is required to run \`vite ${command}\` but was not provided.`,
    );
  }
  return port;
}

export default defineConfig(async ({ command }) => {
  // For `build`, BASE_PATH defaults to "/" because the api-server in the
  // desktop installer mounts the static bundle at root. For `serve` /
  // `preview` it must be explicit because Replit routes each artifact
  // through a path-prefixed proxy (e.g. `/facilitytrack/`).
  const basePath = process.env.BASE_PATH;
  if (command !== "build" && !basePath) {
    throw new Error(
      "BASE_PATH environment variable is required but was not provided.",
    );
  }

  // Replit-only dev plugins — only loaded when running inside Replit and
  // not in a production build. runtimeErrorOverlay is included here too
  // because it is a dev-only tool and importing it in production builds
  // (even if tree-shaken) pulls in a Replit-specific package that is not
  // available in CI or other non-Replit environments.
  const replitPlugins =
    process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : [];

  return {
    base: basePath ?? "/",
    plugins: [react(), tailwindcss(), ...replitPlugins],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port: command === "serve" ? requirePortFor("dev") : (readPort() ?? 0),
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: readPort() ?? 0,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
