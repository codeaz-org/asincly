import Link from "next/link";
import { ChevronDown, MessageCircle } from "lucide-react";
import { cn } from "cn";
import { BlockerRow } from "@/components/dashboard/blocker-row";
import { ReactionBar } from "@/components/emoji/reaction-bar";
import { Markdown } from "@/components/markdown";
import { RecordingPlayer } from "@/components/recording-player";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/card";
import { blockerRows, entryName, mentionsUser, sentLocal } from "@/lib/feed-view";
import { noteItems, plainText } from "@/lib/note-items";
import type { FeedEntry } from "@/lib/queries";
import { VIDEO_SKIP_LABEL, type VideoSkipReason } from "@/lib/validation/social";

// One person's check-in. Summary first (AI bullets, or their Today tasks when
// there's no video); full note, video and replies are one tap away.
export function CheckInCard({
  entry,
  viewerId,
  names,
  detailHref,
  focus,
  expanded = false,
  interactive = true,
  viewerCanManage = false,
}: {
  entry: FeedEntry;
  viewerId: string;
  names: Map<string, string>;
  detailHref?: string;
  focus?: boolean;
  /** Detail page: open the full note and skip the summary preview. */
  expanded?: boolean;
  /** Review step preview: no reactions / blocker actions. */
  interactive?: boolean;
  /** Owners/admins see why someone skipped a required video. */
  viewerCanManage?: boolean;
}) {
  const isMe = entry.userId === viewerId;
  const name = entryName(entry);
  const { time, city } = sentLocal(entry);
  const aiBullets = entry.recordings.flatMap((r) => r.summary?.bullets ?? []);
  const todayItems = noteItems(entry.today);
  const openBlockers = entry.blockerItems.filter((b) => !b.resolved).length;
  const mentionsMe = !isMe && mentionsUser(entry, viewerId);

  return (
    <article
      id={`ci-${entry.checkInId}`}
      data-focus={focus ? "true" : undefined}
      className={cn(
        "feed-card scroll-mt-24 rounded-2xl border bg-ground-raised/60 p-4 sm:p-5 space-y-4",
        isMe ? "border-amber/30" : "border-line",
      )}
    >
      <header className="flex items-start gap-3">
        <Avatar name={entry.userName} email={entry.userEmail} size={40} status="done" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-ink truncate">
            {name}
            {isMe && <span className="ml-2 kicker text-[10px]">you</span>}
          </p>
          <p className="text-xs text-soft">
            <span className="font-mono tabular-nums text-ink/80">{time}</span> in {city}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {mentionsMe && <Pill tone="amber">mentions you</Pill>}
          {entry.videoSkipReason && (viewerCanManage || isMe) && (
            <Pill tone="cold" title={entry.videoSkipNote ?? undefined}>
              no video · {VIDEO_SKIP_LABEL[entry.videoSkipReason as VideoSkipReason]?.toLowerCase() ?? "skipped"}
            </Pill>
          )}
          {openBlockers > 0 && (
            <Pill tone="danger">
              {openBlockers} blocker{openBlockers > 1 ? "s" : ""}
            </Pill>
          )}
        </div>
      </header>

      {!expanded && (
        <div className="space-y-2">
          {aiBullets.length > 0 ? (
            <>
              <p className="kicker text-[10px]">summary · ai</p>
              <ul className="space-y-1.5">
                {aiBullets.slice(0, 5).map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                    <span aria-hidden className="text-amber">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : todayItems.length > 0 ? (
            <>
              <p className="kicker text-[10px]">today</p>
              <ul className="space-y-1.5">
                {todayItems.slice(0, 5).map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                    <span aria-hidden className={t.checked ? "text-ok" : "text-amber"}>
                      {t.checked ? "✓" : "→"}
                    </span>
                    <span className={t.checked ? "text-soft line-through decoration-soft/40" : undefined}>
                      {plainText(t.text)}
                    </span>
                  </li>
                ))}
                {todayItems.length > 5 && <li className="text-xs text-soft pl-5">+{todayItems.length - 5} more</li>}
              </ul>
            </>
          ) : (
            entry.yesterday.trim() && (
              <p className="text-[15px] text-ink line-clamp-3">{plainText(noteItems(entry.yesterday)[0]?.text ?? "")}</p>
            )
          )}
        </div>
      )}

      {entry.recordings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.recordings.map((r) => (
            <RecordingPlayer key={r.id} rec={r} />
          ))}
        </div>
      )}

      {entry.blockerItems.length > 0 && (
        <div className="rounded-xl border border-line bg-ground/40 px-3.5 divide-y divide-line">
          {blockerRows(entry, viewerId, names).map((b) => (
            <BlockerRow key={b.itemKey} data={{ ...b, authorName: undefined }} readOnly={!interactive} />
          ))}
        </div>
      )}

      {expanded ? (
        <FullNote entry={entry} viewerId={viewerId} />
      ) : (
        <details className="group">
          <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-xs text-soft hover:text-ink transition [&::-webkit-details-marker]:hidden">
            Full note
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-4">
            <FullNote entry={entry} viewerId={viewerId} />
          </div>
        </details>
      )}

      {interactive && (
        <footer className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3">
          <ReactionBar checkInId={entry.checkInId} initial={entry.reactions} />
          {detailHref && (
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-xs text-soft hover:text-ink hover:bg-ink/[0.04] transition"
            >
              <MessageCircle className="size-3.5" />
              {entry.commentCount > 0 ? `${entry.commentCount} ${entry.commentCount === 1 ? "reply" : "replies"}` : "Reply"}
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}

function FullNote({ entry, viewerId }: { entry: FeedEntry; viewerId: string }) {
  // Blockers already render as actionable rows above the note.
  const sections = [
    ["Yesterday", entry.yesterday],
    ["Today", entry.today],
    ...(entry.blockerItems.length > 0 ? [] : ([["Blockers", entry.blockers]] as const)),
  ] as const;
  return (
    <div className={cn("grid gap-5", sections.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
      {sections.map(([label, md]) => (
        <div key={label} className="space-y-1.5 min-w-0">
          <p className="kicker text-[10px]">{label}</p>
          <Markdown currentUserId={viewerId}>{md}</Markdown>
        </div>
      ))}
    </div>
  );
}
