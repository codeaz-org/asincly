#!/usr/bin/env node
// Applies drizzle/ migrations (same journal as `drizzle-kit migrate`) using
// only runtime dependencies, so it works in containers and CI.
// Then sets the password of the non-superuser `asincly_app` role the app
// connects as: APP_DB_PASSWORD, or a development default on local databases.
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

  // The migrations create `asincly_app` without a password; set it here.
  const password = process.env.APP_DB_PASSWORD;
  const local = /@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url);
  if (password && (await appLoginWorks())) {
    // Re-setting an unchanged password still changes the stored verifier, and
    // a pooler that cached the old one (Supabase's Supavisor) then rejects the
    // app's logins with 28P01 until it refreshes: an outage on every deploy.
    console.log("asincly_app password already current");
  } else if (password) {
    await sql.unsafe(`ALTER ROLE asincly_app WITH LOGIN PASSWORD ${quote(password)}`);
    console.log("asincly_app password set from APP_DB_PASSWORD");
  } else if (local && process.env.NODE_ENV !== "production") {
    await sql.unsafe(`ALTER ROLE asincly_app WITH LOGIN PASSWORD 'asincly_app'`);
    console.log("asincly_app uses the local development password");
  } else {
    console.warn("APP_DB_PASSWORD is not set: asincly_app has no password, so DATABASE_URL_APP can't connect");
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

// Whether the app can already sign in with DATABASE_URL_APP (whose password
// is APP_DB_PASSWORD). False when it isn't set or the login fails.
async function appLoginWorks() {
  const appUrl = process.env.DATABASE_URL_APP;
  if (!appUrl) return false;
  const app = postgres(appUrl, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await app`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await app.end({ timeout: 5 });
  }
}
