"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps a team page live: asks /api/live every few seconds while the tab is
// visible (and right away when it comes back), and re-renders the page's
// server data when something changed. refresh() keeps client state, so a
// half-written reply or open menu survives it.
export function LiveRefresh({ teamId, every = 10_000 }: { teamId: string; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let stopped = false;
    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/live?team=${teamId}`, { cache: "no-store" });
        const { v } = (await res.json()) as { v: string | null };
        if (stopped || !v) return;
        if (last && v !== last) router.refresh();
        last = v;
      } catch {
        // Offline or signed out: try again next tick.
      }
    }
    void check();
    const timer = setInterval(check, every);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [teamId, every, router]);
  return null;
}
