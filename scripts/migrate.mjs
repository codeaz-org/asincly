#!/usr/bin/env node
// Applies drizzle/ migrations (same journal as `drizzle-kit migrate`) using
// only runtime dependencies, so it works in containers and CI.
// Then, if APP_DB_PASSWORD is set, replaces the development password of the
// non-superuser `asincly_app` role that the app connects as.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("migrations applied");

  const password = process.env.APP_DB_PASSWORD;
  if (password) {
    await sql.unsafe(`ALTER ROLE asincly_app WITH LOGIN PASSWORD ${quote(password)}`);
    console.log("asincly_app password set from APP_DB_PASSWORD");
  } else if (process.env.NODE_ENV === "production") {
    console.warn("APP_DB_PASSWORD is not set: asincly_app still has its development password");
  }

  const [{ bypass }] = await sql`SELECT rolbypassrls OR rolsuper AS bypass FROM pg_roles WHERE rolname = current_user`;
  if (!bypass) {
    console.warn(
      "The DATABASE_URL role can't bypass row-level security. Use your provider's owner/admin role for DATABASE_URL.",
    );
  }
} finally {
  await sql.end();
}

function quote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
