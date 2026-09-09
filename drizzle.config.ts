import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://asincly:asincly@localhost:5433/asincly",
  },
  strict: true,
  verbose: true,
} satisfies Config;
