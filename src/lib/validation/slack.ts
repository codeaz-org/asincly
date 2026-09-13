import { z } from "zod";

export const SlackTeamSchema = z.object({ teamId: z.string().uuid() });

export const SlackSettingsSchema = z.object({
  teamId: z.string().uuid(),
  channelId: z
    .string()
    .regex(/^[CG][A-Z0-9]{6,20}$/)
    .nullable(),
  digestEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
});
