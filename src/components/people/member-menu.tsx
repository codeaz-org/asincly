"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { setMemberRole, transferTeamOwnership } from "@/lib/actions/team-admin";

const ROLES = [
  { role: "admin", label: "Make admin", hint: "Manages schedules, people and settings" },
  { role: "member", label: "Make member", hint: "Checks in" },
  { role: "guest", label: "Make guest", hint: "Reads and replies, free seat" },
] as const;

// Team owner's controls for someone else on the team.
export function MemberMenu({
  memberId,
  name,
  role,
}: {
  memberId: string;
  name: string;
  role: "admin" | "member" | "guest";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="shrink-0">
      <MenuRoot>
        <MenuTrigger
          aria-label={`Change ${name}'s role`}
          disabled={pending}
          className="grid size-8 place-items-center text-soft hover:text-ink"
        >
          <MoreHorizontal className="size-4" />
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>{name}</MenuLabel>
          {ROLES.filter((r) => r.role !== role).map((r) => (
            <MenuItem key={r.role} onClick={() => run(() => setMemberRole({ memberId, role: r.role }))}>
              <span className="flex flex-col">
                <span>{r.label}</span>
                <span className="text-xs text-soft">{r.hint}</span>
              </span>
            </MenuItem>
          ))}
          {role !== "guest" && (
            <>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  if (!window.confirm(`Make ${name} the owner of this team? You'll stay on as an admin.`)) return;
                  run(() => transferTeamOwnership(memberId));
                }}
              >
                Make team owner
              </MenuItem>
            </>
          )}
        </MenuContent>
      </MenuRoot>
      {error && (
        <p role="alert" className="mt-1 max-w-40 text-right text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
