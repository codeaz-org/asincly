"use client";

import { useOptimistic, useState, useTransition } from "react";
import { SmilePlus } from "lucide-react";
import { cn } from "cn";
import { EmojiPickerPopover } from "@/components/emoji/emoji-picker";
import { toggleReaction } from "@/lib/actions/social";
import type { ReactionSummary } from "@/lib/queries";

// Slack-style reactions: a pill per emoji with a count (amber when you've
// reacted), click to toggle, and a picker to add any emoji.
export function ReactionBar({
  checkInId,
  commentId,
  initial,
  size = "md",
  className,
}: {
  checkInId: string;
  commentId?: string;
  initial: ReactionSummary[];
  size?: "sm" | "md";
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic(initial, (current: ReactionSummary[], emoji: string) => {
    const existing = current.find((r) => r.emoji === emoji);
    if (!existing) return [...current, { emoji, count: 1, mine: true, names: ["You"] }];
    return current
      .map((r) =>
        r.emoji === emoji
          ? {
              ...r,
              mine: !r.mine,
              count: r.count + (r.mine ? -1 : 1),
              names: r.mine ? r.names.filter((n) => n !== "You") : ["You", ...r.names],
            }
          : r,
      )
      .filter((r) => r.count > 0);
  });

  function toggle(emoji: string) {
    setError(null);
    startTransition(async () => {
      apply(emoji);
      const res = await toggleReaction({ checkInId, commentId, emoji });
      if (!res.ok) setError(res.error);
    });
  }

  const pill = size === "sm" ? "h-6 px-1.5 text-xs gap-1" : "h-7 px-2 text-[13px] gap-1.5";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {state.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`React with ${r.emoji}, ${r.count}`}
          title={`${formatNames(r.names)} reacted with ${r.emoji}`}
          className={cn(
            "inline-flex items-center rounded-full border transition active:scale-95",
            pill,
            r.mine ? "border-amber/60 bg-amber/[0.14] text-ink" : "border-line bg-ink/[0.04] text-soft hover:border-line-strong hover:text-ink",
          )}
        >
          <span aria-hidden className={cn("emoji leading-none", size === "sm" ? "text-sm" : "text-base")}>
            {r.emoji}
          </span>
          <span className="tabular-nums font-medium">{r.count}</span>
        </button>
      ))}
      <EmojiPickerPopover
        onSelect={(emoji) => {
          const mine = state.find((r) => r.emoji === emoji)?.mine;
          if (!mine) toggle(emoji);
        }}
        trigger={
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full border border-transparent text-soft hover:text-ink hover:border-line hover:bg-ink/[0.04] transition",
              size === "sm" ? "size-6" : "size-7",
            )}
          >
            <SmilePlus className={size === "sm" ? "size-3.5" : "size-4"} />
          </span>
        }
      />
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function formatNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} others`;
}
