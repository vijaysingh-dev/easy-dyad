import path from "path";
import type { Config } from "drizzle-kit";
import { getPath } from "./src/paths";

const dbPath = path.join(getPath("userData"), "sqlite.db");

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
