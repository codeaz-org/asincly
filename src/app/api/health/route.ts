import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { appDb } from "@/db";

export const dynamic = "force-dynamic";

// For Docker HEALTHCHECK, load balancers and uptime monitors: 200 when the app
// can reach Postgres as its app role, 503 when it can't. Says nothing else
// about the server.
export async function GET() {
  try {
    await appDb.execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
