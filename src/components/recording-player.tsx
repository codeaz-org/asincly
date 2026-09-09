"use client";

import { useState } from "react";
import type { FeedRecording } from "@/lib/queries";

// Poster card that swaps into a playing <video> on click. Old recordings
// without a poster get a quiet gradient placeholder.
export function RecordingPlayer({ rec }: { rec: FeedRecording }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <video
        controls
        autoPlay
        playsInline
        src={rec.playbackUrl}
        poster={rec.posterUrl ?? undefined}
        className="w-full aspect-video rounded-lg bg-black border border-white/10"
      />
    );
  }

  const seconds = rec.durationMs ? Math.round(rec.durationMs / 1000) : null;
  const duration =
    seconds !== null
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : null;

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video note${duration ? `, ${duration}` : ""}`}
      className="group relative w-full max-w-md aspect-video rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent text-left"
    >
      {rec.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned URL, next/image can't optimize it
        <img
          src={rec.posterUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition duration-300"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,oklch(0.35_0.05_250/.6),transparent_60%)]"
        />
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      <span className="absolute inset-0 grid place-items-center">
        <span className="grid place-items-center size-12 rounded-full bg-black/55 backdrop-blur border border-white/25 group-hover:scale-110 group-hover:bg-black/70 transition">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M5 3.5v9l8-4.5z" fill="white" />
          </svg>
        </span>
      </span>

      <span className="absolute bottom-2 left-3 text-[11px] font-medium text-white/90">
        Video note
      </span>
      {duration && (
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
          {duration}
        </span>
      )}
      {rec.status === "processing" && (
        <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-300 animate-pulse">
          summarizing…
        </span>
      )}
    </button>
  );
}
