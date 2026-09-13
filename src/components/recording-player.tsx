"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { MarkLoader } from "@/components/brand/loader";
import type { FeedRecording } from "@/lib/queries";

// Poster that swaps into a playing <video> on tap. Summaries are the default
// view; video is always opt-in.
export function RecordingPlayer({ rec, className = "" }: { rec: FeedRecording; className?: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <video
        controls
        autoPlay
        playsInline
        src={rec.playbackUrl}
        poster={rec.posterUrl ?? undefined}
        className={`w-full aspect-video rounded-xl bg-black border border-line ${className}`}
      />
    );
  }

  const seconds = rec.durationMs ? Math.round(rec.durationMs / 1000) : null;
  const duration =
    seconds !== null ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : null;

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video note${duration ? `, ${duration}` : ""}`}
      className={`group relative flex items-center gap-3 w-full sm:w-auto sm:min-w-64 rounded-xl border border-line bg-ink/[0.03] p-1.5 pr-4 text-left hover:border-line-strong hover:bg-ink/[0.05] transition ${className}`}
    >
      <span className="relative block h-12 aspect-video overflow-hidden rounded-lg bg-ground">
        {rec.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned URL, next/image can't optimize it
          <img src={rec.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-85 group-hover:opacity-100 transition" />
        ) : (
          <span aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,oklch(0.4_0.08_60/.6),transparent_70%)]" />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid place-items-center size-6 rounded-full bg-ground/70 backdrop-blur text-ink group-hover:scale-110 transition">
            <Play className="size-3 fill-current translate-x-px" />
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">Video note</span>
        <span className="block text-xs text-soft">
          {rec.status !== "ready" && rec.status !== "failed" ? (
            <MarkLoader size="xs" label="summarizing" />
          ) : rec.status === "failed" ? (
            "couldn't summarize"
          ) : (
            (duration ?? "tap to play")
          )}
        </span>
      </span>
    </button>
  );
}
