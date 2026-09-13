import { z } from "zod";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

// Billing is per organization, but actions are called from a team's settings
// page, so they take the team id (for the permission check and return URL).
export const StartCheckoutSchema = z.object({
  teamId: z.string().uuid(),
  interval: z.enum(BILLING_INTERVALS),
});

export const BillingTeamSchema = z.object({
  teamId: z.string().uuid(),
});

export const INVITE_ROLES = ["member", "guest"] as const;
export const InviteRoleSchema = z.enum(INVITE_ROLES).default("member");
