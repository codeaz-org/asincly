"use client";

import { useState, useTransition } from "react";
import { Hand } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { nudge } from "@/lib/actions/social";
import type { RailStatus } from "@/lib/day-rail";

export type PendingMember = {
  userId: string;
  name: string;
  rawName: string | null;
  email: string;
  status: RailStatus;
  localTime: string;
  city: string;
};

const STATUS_TEXT: Partial<Record<RailStatus, string>> = {
  open: "window open",
  before: "later today",
  missed: "window closed",
  asleep: "asleep",
  away: "away",
};

export function Pending({ teamId, members }: { teamId: string; members: PendingMember[] }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {members.map((m) => (
        <PendingRow key={m.userId} teamId={teamId} member={m} />
      ))}
    </ul>
  );
}

function PendingRow({ teamId, member }: { teamId: string; member: PendingMember }) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const res = await nudge({ teamId, userId: member.userId });
      if (res.ok) setState("sent");
      else {
        setState("error");
        setMessage(res.error);
      }
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink/[0.03] transition">
      <Avatar name={member.rawName} email={member.email} size={32} status={member.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{member.name}</p>
        <p className="text-xs text-soft truncate">
          <span className="font-mono tabular-nums">{member.localTime}</span> {member.city} · {STATUS_TEXT[member.status]}
        </p>
      </div>
      {member.status === "open" &&
        (state === "sent" ? (
          <span className="text-xs text-soft">Nudged</span>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={pending}
            title={message ?? `Let ${member.name} know you're waiting on their check-in`}
            className="inline-flex items-center gap-1.5 h-8 rounded-full border border-line px-3 text-xs text-ink hover:bg-ink/[0.05] disabled:opacity-50 transition"
          >
            <Hand className="size-3.5" />
            {state === "error" ? (message ?? "Try again") : "Nudge"}
          </button>
        ))}
    </li>
  );
}
