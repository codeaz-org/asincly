import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { blockerActions, checkIns, occurrences, schedules } from "@/db/schema";
import type { PrevItem } from "@/lib/ai/draft-schema";
import { blockerItems, itemKey, noteItems } from "@/lib/note-items";

// What the author committed to last time and what's still in their way.
// Shown while recording and handed to the drafter, so the check-in can say
// "done / not done" about the actual plan instead of starting from blank.

export type PreviousContext = {
  /** yyyy-MM-dd of the last sent check-in on this team, if any. */
  lastDate: string | null;
  previous: PrevItem[];
  openBlockers: PrevItem[];
};

export async function getPreviousContext(
  teamId: string,
  userId: string,
  currentOccurrenceId: string,
): Promise<PreviousContext> {
  const recent = await db
    .select({
      checkInId: checkIns.id,
      today: checkIns.today,
      blockers: checkIns.blockers,
      date: occurrences.scheduleDate,
    })
    .from(checkIns)
    .innerJoin(occurrences, eq(occurrences.id, checkIns.occurrenceId))
    .innerJoin(schedules, eq(schedules.id, occurrences.scheduleId))
    .where(
      and(
        eq(schedules.teamId, teamId),
        eq(checkIns.userId, userId),
        eq(checkIns.status, "submitted"),
        ne(checkIns.occurrenceId, currentOccurrenceId),
        gte(checkIns.createdAt, new Date(Date.now() - 21 * 86_400_000)),
      ),
    )
    .orderBy(desc(occurrences.scheduleDate), desc(checkIns.submittedAt))
    .limit(10);

  if (recent.length === 0) return { lastDate: null, previous: [], openBlockers: [] };

  const last = recent[0];
  const previous: PrevItem[] = noteItems(last.today).map((i) => ({
    key: itemKey(i.text),
    text: i.text,
    checked: i.checked === true,
  }));

  // Blockers from recent check-ins the author hasn't marked resolved.
  const resolved = await db
    .select({ checkInId: blockerActions.checkInId, itemKey: blockerActions.itemKey })
    .from(blockerActions)
    .where(
      and(
        inArray(
          blockerActions.checkInId,
          recent.map((r) => r.checkInId),
        ),
        eq(blockerActions.kind, "resolved"),
      ),
    );
  const resolvedSet = new Set(resolved.map((r) => `${r.checkInId}:${r.itemKey}`));
  const seen = new Set<string>();
  const openBlockers: PrevItem[] = [];
  for (const ci of recent.slice(0, 5)) {
    for (const b of blockerItems(ci.blockers)) {
      if (resolvedSet.has(`${ci.checkInId}:${b.key}`) || seen.has(b.key)) continue;
      seen.add(b.key);
      openBlockers.push({ key: b.key, text: b.text, checked: false });
    }
  }

  return { lastDate: last.date, previous: dedupe(previous), openBlockers: openBlockers.slice(0, 5) };
}

function dedupe(items: PrevItem[]): PrevItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
