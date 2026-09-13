"use client";

import { useState } from "react";
import { EmojiPicker } from "frimousse";
import { MarkLoader } from "@/components/brand/loader";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/components/ui/menu";
import { EMOJIBASE_URL, QUICK_REACTIONS, recentEmoji, rememberEmoji } from "@/lib/emoji";

// Slack-style picker: recently used row, search, categories, skin tones.
// Data is self-hosted (see scripts/sync-emoji-data.mjs) and loads on open.
export function EmojiPickerPopover({
  onSelect,
  trigger,
  label = "Add reaction",
  align = "start",
}: {
  onSelect: (emoji: string) => void;
  trigger: React.ReactNode;
  label?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  function pick(emoji: string) {
    rememberEmoji(emoji);
    onSelect(emoji);
    setOpen(false);
  }

  const quick = [...new Set([...recent, ...QUICK_REACTIONS])].slice(0, 8);

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        if (next) setRecent(recentEmoji());
        setOpen(next);
      }}
    >
      <PopoverTrigger aria-label={label} className="outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-full">
        {trigger}
      </PopoverTrigger>
      <PopoverContent align={align} className="p-0 w-[21rem] max-w-[calc(100vw-1.5rem)] overflow-hidden">
        <div className="flex gap-0.5 px-2 pt-2" role="group" aria-label="Frequently used">
          {quick.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              aria-label={`React with ${e}`}
              className="grid place-items-center size-9 rounded-lg text-[22px] hover:bg-ink/[0.08] transition emoji"
            >
              {e}
            </button>
          ))}
        </div>
        <EmojiPicker.Root
          emojibaseUrl={EMOJIBASE_URL}
          columns={8}
          onEmojiSelect={({ emoji }) => pick(emoji)}
          className="isolate flex h-[340px] w-full flex-col"
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <EmojiPicker.Search
              autoFocus
              placeholder="Search emoji"
              className="flex-1 h-9 rounded-lg bg-ink/[0.05] border border-line px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-amber/50"
            />
            <EmojiPicker.SkinToneSelector className="grid place-items-center size-9 rounded-lg hover:bg-ink/[0.08] text-lg emoji" />
          </div>
          <EmojiPicker.Viewport className="relative flex-1 outline-none">
            <EmojiPicker.Loading className="absolute inset-0 grid place-items-center">
              <MarkLoader size="sm" label="Loading emoji" />
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="absolute inset-0 grid place-items-center text-sm text-soft">
              No emoji found.
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="select-none pb-2"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div className="bg-popover px-3 pt-3 pb-1.5 kicker text-[10px]" {...props}>
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1.5 px-1.5" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    className="grid place-items-center size-9 rounded-lg text-[22px] data-[active]:bg-ink/[0.08] emoji"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
          <EmojiPicker.ActiveEmoji>
            {({ emoji }) => (
              <div className="flex h-10 items-center gap-2 border-t border-line px-3 text-sm text-soft">
                {emoji ? (
                  <>
                    <span className="text-xl emoji">{emoji.emoji}</span>
                    <span className="truncate">{emoji.label}</span>
                  </>
                ) : (
                  <span>Pick an emoji…</span>
                )}
              </div>
            )}
          </EmojiPicker.ActiveEmoji>
        </EmojiPicker.Root>
      </PopoverContent>
    </PopoverRoot>
  );
}
