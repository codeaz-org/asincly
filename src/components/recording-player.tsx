"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { MarkLoader } from "@/components/brand/loader";
import { getPlaybackUrl } from "@/lib/actions/recording";
import type { FeedRecording } from "@/lib/queries";

// Poster that swaps into a playing <video> on tap. Summaries are the default
// view; video is always opt-in, and its signed URL is fetched only then.
export function RecordingPlayer({ rec, className = "" }: { rec: FeedRecording; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const video = useRef<HTMLVideoElement>(null);
  const resumeAt = useRef(0);

  async function load() {
    setState("loading");
    const res = await getPlaybackUrl(rec.id);
    if (!res.ok) return setState("error");
    setSrc(res.url);
    setState("idle");
  }

  if (src) {
    return (
      <video
        ref={video}
        controls
        autoPlay
        playsInline
        src={src}
        poster={rec.posterUrl ?? undefined}
        onLoadedMetadata={() => {
          if (video.current && resumeAt.current) video.current.currentTime = resumeAt.current;
        }}
        // The URL expired mid-watch (a seek after the window): get a new one
        // and carry on from the same spot.
        onError={() => {
          resumeAt.current = video.current?.currentTime ?? 0;
          void load();
        }}
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
      onClick={() => void load()}
      disabled={state === "loading"}
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
          {state === "error" ? (
            "couldn't load the video"
          ) : state === "loading" ? (
            <MarkLoader size="xs" label="loading" />
          ) : rec.status !== "ready" && rec.status !== "failed" ? (
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
