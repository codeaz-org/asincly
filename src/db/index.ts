import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Admin client (superuser). Used by drizzle-kit migrate and the Auth.js
// adapter — magic-link flows need to write user/verificationToken before a
// session exists. Never use this for feature queries.
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_URL is not set");
const adminClient = postgres(adminUrl, { max: 5, prepare: false });
export const db = drizzle(adminClient, { schema });

// App client (non-superuser, RLS-enforced). Every feature query must go
// through withUser() so app.current_user_id is set for policy checks.
const appUrl = process.env.DATABASE_URL_APP ?? adminUrl;
const appClient = postgres(appUrl, { max: 10, prepare: false });
export const appDb = drizzle(appClient, { schema });
