import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Owner client: bypasses row-level security. For code that acts for no
// single viewer (the Auth.js adapter, cron jobs, webhooks, notifications to
// teammates, admin flows). eslint.config.mjs allowlists the files that may
// import it; everything else goes through withUser().
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_URL is not set");
const adminClient = postgres(adminUrl, { max: 5, prepare: false });
export const db = drizzle(adminClient, { schema });

// App client (non-superuser, RLS-enforced). Every feature query must go
// through withUser() so app.current_user_id is set for policy checks.
const appUrl = process.env.DATABASE_URL_APP ?? adminUrl;
const appClient = postgres(appUrl, { max: 10, prepare: false });
export const appDb = drizzle(appClient, { schema });
