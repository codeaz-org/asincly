import { db } from "@/db";
import { auditLogs } from "@/db/schema";

type Args = {
  orgId: string;
  actorUserId: string | null;
  action: string; // e.g. "org.create", "team.delete", "member.invite"
  resourceType: string; // e.g. "organization", "team", "member"
  resourceId?: string | null;
  meta?: Record<string, unknown>;
};

// Best-effort audit write. Failures are logged but never bubble up — we
// don't want an audit-log outage to fail a business action.
export async function audit(args: Args): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      orgId: args.orgId,
      actorUserId: args.actorUserId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      meta: args.meta,
    });
  } catch (e) {
    // Identifiers only: meta can hold user text (reasons, invitee emails).
    console.error("[audit] write failed", {
      orgId: args.orgId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      error: e instanceof Error ? e.message : "unknown error",
    });
  }
}
