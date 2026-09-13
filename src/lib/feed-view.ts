import { formatInTimeZone } from "date-fns-tz";
import type { BlockerRowData } from "@/components/dashboard/blocker-row";
import { cityFromTz } from "@/lib/day-rail";
import { displayName, firstName } from "@/lib/display";
import { extractMentions } from "@/lib/mentions";
import type { FeedEntry, Roster } from "@/lib/queries";

// Shapes FeedEntry rows into what the dashboard components render.

export function namesById(roster: Roster): Map<string, string> {
  return new Map(roster.map((r) => [r.userId, firstName(r.name, r.email)]));
}

export function blockerRows(entry: FeedEntry, viewerId: string, names: Map<string, string>): BlockerRowData[] {
  return entry.blockerItems.map((b) => ({
    checkInId: entry.checkInId,
    itemKey: b.key,
    text: b.text,
    resolved: b.resolved,
    helperNames: b.helperIds.filter((id) => id !== viewerId).map((id) => names.get(id) ?? "Someone"),
    viewerHelping: b.helperIds.includes(viewerId),
    viewerIsAuthor: entry.userId === viewerId,
    authorName: firstName(entry.userName, entry.userEmail),
    mentionsViewer: b.mentions.some((m) => m.userId === viewerId),
  }));
}

export function mentionsUser(entry: FeedEntry, userId: string): boolean {
  return [entry.yesterday, entry.today, entry.blockers].some((md) =>
    extractMentions(md).some((m) => m.userId === userId),
  );
}

// "07:40 in Auckland" — when they sent it, in their own day.
export function sentLocal(entry: FeedEntry): { time: string; city: string } {
  return {
    time: formatInTimeZone(entry.submittedAt, entry.userTz, "HH:mm"),
    city: cityFromTz(entry.userTz),
  };
}

export function entryName(entry: FeedEntry): string {
  return displayName(entry.userName, entry.userEmail);
}

// "Tue 15 Sep" for a yyyy-MM-dd schedule date.
export function dayLabel(iso: string, style: "short" | "long" = "short"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    timeZone: "UTC",
  });
}

export function relativeDay(iso: string, todayISO: string): string {
  const diff = Math.round((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dayLabel(iso);
}
