"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";
import Link from "next/link";
import { Video } from "lucide-react";
import { setTeamRules } from "@/lib/actions/team-admin";

export function RulesCard({
  teamId,
  requireVideo,
  locked = false,
  billingHref = null,
}: {
  teamId: string;
  requireVideo: boolean;
  /** Pro-only on the hosted cloud. */
  locked?: boolean;
  billingHref?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(requireVideo);
  const titleId = useId();
  const hintId = useId();

  return (
    <div className="p-4 sm:p-5 space-y-2">
      {/* Not a <label>: wrapping the switch would forward clicks and toggle it twice. */}
      <div className="flex items-center gap-4">
        <span className="grid place-items-center size-9 rounded-xl bg-ink/[0.05] text-soft shrink-0">
          <Video className="size-4" />
        </span>
        <span className="flex-1">
          <span id={titleId} className="block text-[15px] font-medium text-ink">
            Require a video
            {locked && <span className="ml-2 text-[11px] font-normal text-amber">Pro</span>}
          </span>
          <span id={hintId} className="block text-sm text-soft">
            Everyone records their check-in. People who can&rsquo;t record give a reason, which owners and admins see.
          </span>
        </span>
        <Switch.Root
          checked={on}
          disabled={locked}
          onCheckedChange={(checked) =>
            startTransition(async () => {
              setError(null);
              setOn(checked);
              const res = await setTeamRules({ teamId, requireVideo: checked });
              if (!res.ok) setError(res.error);
            })
          }
          aria-labelledby={titleId}
          aria-describedby={hintId}
          className="relative inline-flex h-7 w-12 shrink-0 data-[disabled]:opacity-45 rounded-full border border-line-strong bg-ink/[0.08] transition-colors data-[checked]:bg-amber data-[checked]:border-amber outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          <Switch.Thumb className="block size-5 translate-x-1 translate-y-[3px] rounded-full bg-ink shadow transition-transform data-[checked]:translate-x-6 data-[checked]:bg-amber-ink" />
        </Switch.Root>
      </div>
      {locked && billingHref && (
        <p className="text-xs text-soft">
          Available on Pro.{" "}
          <Link href={billingHref} className="text-amber hover:underline underline-offset-4">
            See Pro →
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
