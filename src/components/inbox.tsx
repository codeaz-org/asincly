"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, Bell, CircleAlert, Hand, MessageCircle, Sparkles, Sunrise, Check } from "lucide-react";
import { markAllRead } from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/components/ui/menu";
import { LogoMark } from "@/components/brand/mark";

export type InboxItem = {
  id: string;
  type:
    | "mentioned"
    | "blocker_on_your_item"
    | "window_open"
    | "digest_ready"
    | "commented"
    | "help_offered"
    | "blocker_resolved"
    | "nudged";
  title: string;
  body: string | null;
  linkPath: string | null;
  createdAt: Date;
  readAt: Date | null;
};

export function Inbox({ items, unread }: { items: InboxItem[]; unread: number }) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
        className="relative grid place-items-center size-9 rounded-lg text-soft hover:text-ink hover:bg-ink/[0.05] transition outline-none focus-visible:ring-2 focus-visible:ring-amber"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-amber text-[10px] font-semibold text-amber-ink grid place-items-center tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="kicker">Inbox</span>
          {unread > 0 && (
            <form action={markAllRead}>
              <Button type="submit" variant="ghost" size="sm" className="h-7 -mr-2">
                <Check /> Mark all read
              </Button>
            </form>
          )}
        </header>
        {items.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
            <LogoMark size={28} state="done" className="text-ink" />
            <p className="text-sm text-soft">All caught up.</p>
          </div>
        ) : (
          <ul className="max-h-[26rem] overflow-y-auto py-1">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationRow item={n} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

function NotificationRow({ item, onNavigate }: { item: InboxItem; onNavigate: () => void }) {
  const content = (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-ink/[0.04] transition">
      <span
        className={`mt-0.5 grid place-items-center size-7 rounded-full shrink-0 [&_svg]:size-3.5 ${
          item.readAt ? "bg-ink/[0.05] text-soft" : "bg-amber/[0.14] text-amber"
        }`}
      >
        {iconFor(item.type)}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={`text-sm leading-snug ${item.readAt ? "text-soft" : "text-ink font-medium"}`}>{item.title}</p>
        {item.body && <p className="text-xs text-soft line-clamp-2">{item.body}</p>}
        <p className="text-[10px] font-mono text-faint" suppressHydrationWarning>
          {relative(item.createdAt)}
        </p>
      </div>
      {!item.readAt && <span aria-label="unread" className="mt-2 size-1.5 rounded-full bg-amber shrink-0" />}
    </div>
  );
  if (item.linkPath) {
    return (
      <Link href={item.linkPath} onClick={onNavigate} className="block outline-none focus-visible:bg-ink/[0.06]">
        {content}
      </Link>
    );
  }
  return content;
}

function iconFor(t: InboxItem["type"]): React.ReactNode {
  switch (t) {
    case "mentioned":
      return <AtSign />;
    case "blocker_on_your_item":
      return <CircleAlert />;
    case "window_open":
      return <Sunrise />;
    case "commented":
      return <MessageCircle />;
    case "help_offered":
      return <Hand />;
    case "blocker_resolved":
      return <Check />;
    case "nudged":
      return <Hand />;
    default:
      return <Sparkles />;
  }
}

function relative(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
