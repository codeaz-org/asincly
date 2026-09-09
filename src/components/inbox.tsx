"use client";

import { useState } from "react";
import Link from "next/link";
import { markAllRead } from "@/lib/actions/notifications";

export type InboxItem = {
  id: string;
  type: "mentioned" | "blocker_on_your_item" | "window_open" | "digest_ready";
  title: string;
  body: string | null;
  linkPath: string | null;
  createdAt: Date;
  readAt: Date | null;
};

export function Inbox({ items, unread }: { items: InboxItem[]; unread: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center size-9 rounded-md border border-white/10 hover:bg-white/[0.04] transition"
        aria-label="Inbox"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0v5l1.5 3H4.5L6 13Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] font-mono text-accent-foreground grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur shadow-xl overflow-hidden">
            <header className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Inbox
              </span>
              {unread > 0 && (
                <form action={markAllRead}>
                  <button
                    type="submit"
                    className="text-[11px] text-muted-foreground hover:text-foreground transition"
                  >
                    Mark all read
                  </button>
                </form>
              )}
            </header>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                No notifications.
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className={n.readAt ? "opacity-70" : ""}>
                    <NotificationRow item={n} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onNavigate,
}: {
  item: InboxItem;
  onNavigate: () => void;
}) {
  const dot = dotFor(item.type);
  const content = (
    <div className="flex items-start gap-3 px-3 py-3 hover:bg-white/[0.03] transition">
      <span className={`mt-1.5 size-1.5 rounded-full ${dot}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.body && (
          <p className="text-xs text-muted-foreground truncate">{item.body}</p>
        )}
        <p className="text-[10px] font-mono text-muted-foreground/70">
          {relative(item.createdAt)}
        </p>
      </div>
    </div>
  );
  if (item.linkPath) {
    return (
      <Link href={item.linkPath} onClick={onNavigate} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function dotFor(t: InboxItem["type"]): string {
  if (t === "mentioned") return "bg-accent";
  if (t === "blocker_on_your_item") return "bg-red-400";
  if (t === "window_open") return "bg-amber-400";
  return "bg-indigo-400";
}

function relative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}
