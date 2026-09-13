"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/brand/mark";

// Full-screen moment after a check-in is sent: the morning half fills, a
// warm glow rises behind it, then `onDone` fires (usually a navigation).
// Reduced motion skips straight to `onDone`.
export function Sunrise({
  title,
  subtitle,
  onDone,
  durationMs = 1400,
}: {
  title: string;
  subtitle?: string;
  onDone: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduced ? 0 : durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs]);

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[100] grid place-items-center bg-ground/95 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative flex flex-col items-center gap-6 text-center px-6">
        <span
          aria-hidden
          className="absolute top-8 left-1/2 -translate-x-1/2 -translate-y-1/2 size-56 rounded-full"
          style={{
            background: "radial-gradient(circle, oklch(0.78 0.15 60 / 0.35), transparent 65%)",
            animation: "sunrise-glow 1.2s cubic-bezier(0.23,1,0.32,1) both",
          }}
        />
        <span className="relative text-ink">
          <LogoMark size={72} state="before" />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ animation: "sunrise-fill 700ms 150ms cubic-bezier(0.65,0,0.35,1) both" }}
          >
            <LogoMark size={72} state="done" />
          </span>
        </span>
        <div className="relative space-y-2 animate-rise-in [animation-delay:300ms]">
          <p className="display text-3xl">{title}</p>
          {subtitle && <p className="text-sm text-soft">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
