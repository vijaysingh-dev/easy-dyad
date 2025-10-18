import path from "path";
import type { Config } from "drizzle-kit";
import { getUserDataPath } from "./server/src/shared/paths";

const dbPath = path.join(getUserDataPath(), "sqlite.db");

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
