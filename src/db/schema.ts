import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ponytail: smoke table to prove migrations run end-to-end. Real schema lands in Phase 1.
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
