"use client";

import { useState } from "react";
import type { FeedRecording } from "@/lib/queries";

export function RecordingPlayer({ rec }: { rec: FeedRecording }) {
  const [open, setOpen] = useState(false);

  const dur = rec.durationMs
    ? `${Math.round(rec.durationMs / 1000)}s`
    : rec.status === "processing"
      ? "processing…"
      : rec.status === "failed"
        ? "failed"
        : "ready";

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] transition"
      >
        <span
          aria-hidden
          className={`grid place-items-center size-7 rounded-full bg-white/10 text-xs transition ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="flex-1 text-xs">
          <span className="font-medium">Video note</span>
          <span className="ml-2 text-muted-foreground font-mono">{dur}</span>
        </span>
      </button>
      {open && (
        <div className="p-2">
          <video
            controls
            preload="metadata"
            src={rec.playbackUrl}
            className="w-full aspect-video rounded bg-black"
          />
        </div>
      )}
    </div>
  );
}
