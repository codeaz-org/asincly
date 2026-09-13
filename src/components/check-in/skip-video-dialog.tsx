"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { VIDEO_SKIP_LABEL, VIDEO_SKIP_REASONS, type VideoSkipReason } from "@/lib/validation/social";

export type VideoSkip = { reason: VideoSkipReason; note: string | null };

// Teams that require video still let people skip — with a reason their
// owners and admins can see.
export function SkipVideoDialog({
  open,
  onOpenChange,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: VideoSkip | null;
  onConfirm: (skip: VideoSkip) => void;
}) {
  const [reason, setReason] = useState<VideoSkipReason | null>(initial?.reason ?? null);
  const [note, setNote] = useState(initial?.note ?? "");

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ground/70 backdrop-blur-sm transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed z-50 inset-x-3 bottom-3 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[26rem] rounded-2xl border border-line bg-popover p-5 space-y-5 shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7)] outline-none transition data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2 data-[ending-style]:opacity-0">
          <div className="space-y-1.5">
            <Dialog.Title className="text-lg font-semibold text-ink">Can&rsquo;t record today?</Dialog.Title>
            <Dialog.Description className="text-sm text-soft">
              Your team asks for a video. Tell them why, then write your check-in instead.
            </Dialog.Description>
          </div>
          <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-2">
            {VIDEO_SKIP_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm transition",
                  reason === r ? "border-amber/60 bg-amber/[0.12] text-ink" : "border-line text-soft hover:text-ink",
                )}
              >
                {VIDEO_SKIP_LABEL[r]}
              </button>
            ))}
          </div>
          <Input
            aria-label="Note (optional)"
            placeholder="Anything to add? (optional)"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>Cancel</Dialog.Close>
            <Button
              variant="primary"
              disabled={!reason}
              onClick={() => {
                if (!reason) return;
                onConfirm({ reason, note: note.trim() || null });
                onOpenChange(false);
              }}
            >
              Write it instead
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
