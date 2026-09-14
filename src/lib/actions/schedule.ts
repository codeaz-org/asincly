"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { members, organizations, schedules, teams } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PRESET_RRULES, type PresetKey } from "@/lib/time";
import { hhmm, withWindowLength } from "@/lib/validation/schedule";
import { withUser } from "@/db/with-user";

const UpdateSchema = withWindowLength(
  z.object({
    scheduleId: z.string().uuid(),
    name: z.string().min(1).max(80),
    preset: z.enum(["daily", "weekdays", "mwf", "weekly", "custom"]),
    customRrule: z.string().max(500).optional(),
    windowOpen: hhmm,
    windowClose: hhmm,
    active: z.enum(["on", "off"]).default("on"),
  }),
);

export async function updateSchedule(formData: FormData) {
  const user = await requireUser();
  const parsed = UpdateSchema.parse({
    scheduleId: formData.get("scheduleId"),
    name: formData.get("name"),
    preset: formData.get("preset"),
    customRrule: formData.get("customRrule") || undefined,
    windowOpen: formData.get("windowOpen"),
    windowClose: formData.get("windowClose"),
    active: formData.get("active") ?? "off",
  });

  const rrule =
    parsed.preset === "custom"
      ? (parsed.customRrule ?? "").trim()
      : PRESET_RRULES[parsed.preset as PresetKey];
  if (!rrule) throw new Error("A custom RRULE is required when preset=custom");

  // Look up the team for redirect. Admin db is fine — we're routing metadata.
  const [row] = await db
    .select({
      teamSlug: teams.slug,
      orgSlug: organizations.slug,
      role: members.role,
    })
    .from(schedules)
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .innerJoin(
      members,
      and(eq(members.teamId, teams.id), eq(members.userId, user.id)),
    )
    .where(eq(schedules.id, parsed.scheduleId));
  if (!row) throw new Error("Schedule not found or you are not a member");
  if (row.role !== "owner" && row.role !== "admin") throw new Error("Not permitted");

  await withUser(user.id, (tx) =>
    tx
      .update(schedules)
      .set({
        name: parsed.name,
        rrule,
        windowOpenLocal: parsed.windowOpen,
        windowCloseLocal: parsed.windowClose,
        active: parsed.active === "on",
      })
      .where(eq(schedules.id, parsed.scheduleId)),
  );

  redirect(`/${row.orgSlug}/${row.teamSlug}`);
}
