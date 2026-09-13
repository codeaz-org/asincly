"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Hand, Undo2 } from "lucide-react";
import { cn } from "cn";
import { toggleHelp, toggleResolved } from "@/lib/actions/social";
import { plainText } from "@/lib/note-items";

export type BlockerRowData = {
  checkInId: string;
  itemKey: string;
  text: string;
  resolved: boolean;
  /** Helpers other than the viewer. */
  helperNames: string[];
  viewerHelping: boolean;
  viewerIsAuthor: boolean;
  /** Shown before the text in Needs attention ("Lena"). */
  authorName?: string;
  mentionsViewer?: boolean;
};

type Optimistic = { resolved: boolean; viewerHelping: boolean };

export function BlockerRow({ data, readOnly }: { data: BlockerRowData; readOnly?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [s, apply] = useOptimistic<Optimistic, "help" | "resolve">(
    { resolved: data.resolved, viewerHelping: data.viewerHelping },
    (cur, action) =>
      action === "resolve" ? { ...cur, resolved: !cur.resolved } : { ...cur, viewerHelping: !cur.viewerHelping },
  );

  function run(action: "help" | "resolve") {
    setError(null);
    startTransition(async () => {
      apply(action);
      const input = { checkInId: data.checkInId, itemKey: data.itemKey };
      const res = action === "help" ? await toggleHelp(input) : await toggleResolved(input);
      if (!res.ok) setError(res.error);
    });
  }

  const helpers = [...(s.viewerHelping ? ["You"] : []), ...data.helperNames];

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 rounded-full shrink-0",
          s.resolved ? "bg-ok/70" : "bg-danger shadow-[0_0_10px_oklch(0.72_0.15_35/0.6)]",
        )}
      />
      <div className="flex-1 min-w-[12rem]">
        <p className={cn("text-sm leading-relaxed", s.resolved ? "text-soft line-through decoration-soft/50" : "text-ink")}>
          {data.authorName && <span className="font-medium">{data.authorName} · </span>}
          {plainText(data.text)}
        </p>
        <p className="text-xs text-soft mt-0.5">
          {s.resolved
            ? "Resolved"
            : helpers.length > 0
              ? `${helpers[0]}${helpers.length > 1 ? ` + ${helpers.length - 1}` : ""} can help`
              : data.mentionsViewer
                ? "Needs you"
                : "Waiting"}
        </p>
        {error && (
          <p role="alert" className="text-xs text-danger mt-1">
            {error}
          </p>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-1.5 ml-5 sm:ml-0">
          {data.viewerIsAuthor ? (
            <button
              type="button"
              onClick={() => run("resolve")}
              className="inline-flex items-center gap-1.5 h-8 rounded-full border border-line px-3 text-xs text-ink hover:bg-ink/[0.05] transition"
            >
              {s.resolved ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
              {s.resolved ? "Reopen" : "Resolved"}
            </button>
          ) : (
            !s.resolved && (
              <button
                type="button"
                onClick={() => run("help")}
                aria-pressed={s.viewerHelping}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs transition",
                  s.viewerHelping
                    ? "border-amber/50 bg-amber/[0.12] text-ink"
                    : "border-line text-ink hover:bg-ink/[0.05]",
                )}
              >
                <Hand className="size-3.5" />
                {s.viewerHelping ? "You're helping" : "I can help"}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
