"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeOtherSessions, revokeSession, type SessionView } from "@/lib/actions/account-security";

function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d) : "—");

export function SessionList({ sessions }: { sessions: SessionView[] }) {
  const [pending, startTransition] = useTransition();
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="divide-y divide-line">
      {sessions.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink">
              {device(s.userAgent)}
              {s.current && <span className="ml-2 kicker text-[10px]">this browser</span>}
            </p>
            <p className="text-xs text-soft">
              Signed in {when(s.createdAt)} · last active {when(s.lastSeenAt)}
              {s.ipPrefix && ` · network ${s.ipPrefix}`}
            </p>
          </div>
          {!s.current && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (await revokeSession(s.id)))}>
              Sign out
            </Button>
          )}
        </div>
      ))}
      {others > 0 && (
        <div className="px-4 sm:px-5 py-3">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(async () => void (await revokeOtherSessions()))}>
            Sign out everywhere else
          </Button>
        </div>
      )}
    </div>
  );
}
