import { sql } from "drizzle-orm";
import { appDb } from "./index";

type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];

// Every RLS-guarded query goes through this. Opens a transaction, sets
// app.current_user_id via SET LOCAL (scoped to the tx), runs the callback,
// and lets postgres discard the setting at COMMIT.
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser: userId is required");
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}

// A connection to read with: a withUser() transaction on the request path,
// or `db` for server jobs that act for nobody in particular.
export type Q = typeof appDb | Tx;
