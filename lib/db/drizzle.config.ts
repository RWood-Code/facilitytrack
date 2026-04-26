import { defineConfig } from "drizzle-kit";
import path from "path";

const here = __dirname;
const dbPath =
  process.env.FACILITYTRACK_DB_PATH ??
  path.resolve(here, "..", "..", ".data", "facilitytrack.sqlite");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
