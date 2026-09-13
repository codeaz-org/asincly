"use client";

import { Check, ChevronsUpDown, LogOut, Plus, Settings2, UserRound } from "lucide-react";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuLink,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export type TeamOption = {
  memberId: string;
  orgName: string;
  orgSlug: string;
  teamName: string;
  teamSlug: string;
};

export function TeamSwitcher({
  current,
  teams,
}: {
  current: { orgName: string; teamName: string; orgSlug: string; teamSlug: string };
  teams: TeamOption[];
}) {
  return (
    <MenuRoot>
      <MenuTrigger className="group inline-flex items-center gap-2 h-9 px-2 -mx-2 min-w-0 hover:bg-ink/[0.05] transition">
        <span className="min-w-0 text-left leading-tight">
          <span className="block text-[10px] kicker truncate">{current.orgName}</span>
          <span className="block text-sm font-medium text-ink truncate">{current.teamName}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-faint group-hover:text-soft shrink-0" />
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <MenuLabel>Your teams</MenuLabel>
        {teams.map((t) => {
          const active = t.orgSlug === current.orgSlug && t.teamSlug === current.teamSlug;
          return (
            <MenuLink key={t.memberId} href={`/${t.orgSlug}/${t.teamSlug}`}>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{t.teamName}</span>
                <span className="block text-xs text-soft truncate">{t.orgName}</span>
              </span>
              {active && <Check className="size-4 text-amber" />}
            </MenuLink>
          );
        })}
        <MenuSeparator />
        <MenuLink href={`/${current.orgSlug}/${current.teamSlug}/people#new-team`}>
          <Plus className="size-4 text-soft" /> New team
        </MenuLink>
      </MenuContent>
    </MenuRoot>
  );
}

export function UserMenu({
  name,
  email,
  settingsHref,
  signOutAction,
}: {
  name: string;
  email: string;
  settingsHref: string | null;
  signOutAction: () => Promise<void>;
}) {
  const initial = (name[0] ?? email[0] ?? "?").toUpperCase();
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label="Account menu"
        className="grid place-items-center size-9 rounded-full border border-line bg-ink/[0.04] text-sm font-medium text-ink hover:border-line-strong transition"
      >
        {initial}
      </MenuTrigger>
      <MenuContent className="w-64">
        <div className="px-3 py-2.5">
          <p className="text-sm font-medium text-ink truncate">{name}</p>
          <p className="text-xs text-soft truncate">{email}</p>
        </div>
        <MenuSeparator />
        <MenuLink href="/account">
          <UserRound className="size-4 text-soft" /> Account
        </MenuLink>
        {settingsHref && (
          <MenuLink href={settingsHref} className="md:hidden">
            <Settings2 className="size-4 text-soft" /> Team settings
          </MenuLink>
        )}
        <MenuSeparator />
        <form action={signOutAction}>
          <MenuItem
            render={<button type="submit" />}
            nativeButton
            closeOnClick={false}
            className="text-soft data-[highlighted]:text-danger"
          >
            <LogOut className="size-4" /> Sign out
          </MenuItem>
        </form>
      </MenuContent>
    </MenuRoot>
  );
}
