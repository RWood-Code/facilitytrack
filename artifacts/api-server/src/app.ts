import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable must be set in production");
  }
  process.env.SESSION_SECRET = "facilitytrack-dev-secret-do-not-use-in-production";
}

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie security: when the api-server runs behind HTTPS (Replit web
// deployment, the licence server, etc.) we want `secure: true` + strict
// SameSite. When it runs INSIDE the Electron desktop app it binds plain
// http://127.0.0.1:<port>, so a `secure: true` cookie never makes it back
// to the browser on the next request — the user "logs in", the redirect
// fires, /auth/me sees no session, and the UI bounces back to the sign-in
// screen. The desktop main process sets FACILITYTRACK_INSECURE_COOKIES=1
// to opt out of secure cookies (safe because the listener is loopback only
// and not reachable from any other host on the network).
const insecureCookies =
  process.env.FACILITYTRACK_INSECURE_COOKIES === "1" ||
  process.env.FACILITYTRACK_INSECURE_COOKIES === "true";
const productionSecureCookie =
  process.env.NODE_ENV === "production" && !insecureCookies;
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: productionSecureCookie,
      sameSite: productionSecureCookie ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const staticPath =
    process.env.STATIC_FILES_PATH ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../facilitytrack/dist/public");

  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
    logger.info({ staticPath }, "Serving frontend static files");
  } else {
    logger.warn({ staticPath }, "Static files path not found — frontend will not be served");
  }
}

export default app;
