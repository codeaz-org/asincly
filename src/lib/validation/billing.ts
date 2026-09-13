import { z } from "zod";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const StartCheckoutSchema = z.object({
  orgId: z.string().uuid(),
  interval: z.enum(BILLING_INTERVALS),
});

export const OrgOnlySchema = z.object({
  orgId: z.string().uuid(),
});

export const INVITE_ROLES = ["member", "guest"] as const;
export const InviteRoleSchema = z.enum(INVITE_ROLES).default("member");
