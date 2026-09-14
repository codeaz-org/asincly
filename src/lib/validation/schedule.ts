import { z } from "zod";
import { MIN_WINDOW_MINUTES, windowMinutes } from "@/lib/time";

// Boundary schema shared by onboarding and the schedule editor, so both
// enforce the same window rules.

const HHMM = /^\d{2}:\d{2}$/;

export const hhmm = z.string().regex(HHMM, "Use HH:MM");

// A window shorter than the reminder tick can close before any tick observes
// it open, so nobody is reminded. Applied as a refinement on the object
// because it needs both fields.
export function withWindowLength<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.refine(
    (v) => windowMinutes((v as { windowOpen: string }).windowOpen, (v as { windowClose: string }).windowClose) >= MIN_WINDOW_MINUTES,
    {
      message: `The check-in window must be at least ${MIN_WINDOW_MINUTES} minutes long.`,
      path: ["windowClose"],
    },
  );
}
