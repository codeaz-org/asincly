"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings2, Sun, Users } from "lucide-react";
import { cn } from "cn";
import { LogoMark, type MarkState } from "@/components/brand/mark";

type Tab = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

function useTabs(teamRoot: string, isOwner: boolean): Tab[] {
  const tabs: Tab[] = [
    { href: teamRoot, label: "Today", icon: <Sun />, exact: true },
    { href: `${teamRoot}/people`, label: "People", icon: <Users /> },
  ];
  if (isOwner) tabs.push({ href: `${teamRoot}/settings`, label: "Settings", icon: <Settings2 /> });
  return tabs;
}

function isActive(pathname: string, tab: Tab, teamRoot: string): boolean {
  if (tab.exact) return pathname === tab.href || pathname.startsWith(`${teamRoot}/c/`);
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function DesktopTabs({ teamRoot, isOwner }: { teamRoot: string; isOwner: boolean }) {
  const pathname = usePathname();
  const tabs = useTabs(teamRoot, isOwner);
  return (
    <nav aria-label="Team" className="hidden md:flex items-center gap-1">
      {tabs.map((t) => {
        const active = isActive(pathname, t, teamRoot);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative h-9 px-3 rounded-lg text-sm inline-flex items-center transition-colors",
              active ? "text-ink" : "text-soft hover:text-ink",
            )}
          >
            {t.label}
            {active && (
              <span aria-hidden className="absolute left-3 right-3 -bottom-[13px] h-px bg-amber shadow-[0_0_10px_oklch(0.78_0.15_60/0.6)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// Phones: Today · [check-in mark] · People. The centre button is the logo
// mark drawn in the viewer's own state for today — it *is* the status.
export function BottomNav({
  teamRoot,
  myState,
  checkInLabel,
  canCheckIn = true,
}: {
  teamRoot: string;
  myState: MarkState;
  checkInLabel: string;
  /** Guests read along but don't check in. */
  canCheckIn?: boolean;
}) {
  const pathname = usePathname();
  const tabs = useTabs(teamRoot, false);
  const [today, people] = tabs;
  return (
    <nav
      aria-label="Team"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3 h-16 items-center">
        <BottomTab tab={today} active={isActive(pathname, today, teamRoot)} />
        <div className="grid place-items-center">
          {canCheckIn ? (
            <Link
              href={`${teamRoot}/check-in`}
              aria-label={checkInLabel}
              className="-mt-7 grid place-items-center size-16 rounded-full bg-ground border border-line-strong shadow-[0_10px_30px_-10px_oklch(0.78_0.15_60/0.5)] text-ink active:scale-95 transition"
            >
              <LogoMark size={36} state={myState} />
            </Link>
          ) : (
            <LogoMark size={28} state="idle" className="text-faint" />
          )}
        </div>
        <BottomTab tab={people} active={isActive(pathname, people, teamRoot)} />
      </div>
    </nav>
  );
}

function BottomTab({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 text-[11px] [&_svg]:size-5 transition-colors",
        active ? "text-amber" : "text-soft",
      )}
    >
      {tab.icon}
      {tab.label}
    </Link>
  );
}
