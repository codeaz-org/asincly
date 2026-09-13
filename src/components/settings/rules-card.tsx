"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";
import { Video } from "lucide-react";
import { setTeamRules } from "@/lib/actions/team-admin";

export function RulesCard({ teamId, requireVideo }: { teamId: string; requireVideo: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(requireVideo);

  return (
    <div className="p-4 sm:p-5 space-y-2">
      <label className="flex items-center gap-4 cursor-pointer">
        <span className="grid place-items-center size-9 rounded-xl bg-ink/[0.05] text-soft shrink-0">
          <Video className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-ink">Require a video</span>
          <span className="block text-sm text-soft">
            Everyone records their check-in. People who can&rsquo;t record give a reason, which owners and admins see.
          </span>
        </span>
        <Switch.Root
          checked={on}
          onCheckedChange={(checked) =>
            startTransition(async () => {
              setError(null);
              setOn(checked);
              const res = await setTeamRules({ teamId, requireVideo: checked });
              if (!res.ok) setError(res.error);
            })
          }
          aria-label="Require a video"
          className="relative inline-flex h-7 w-12 shrink-0 rounded-full border border-line-strong bg-ink/[0.08] transition-colors data-[checked]:bg-amber data-[checked]:border-amber outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          <Switch.Thumb className="block size-5 translate-x-1 translate-y-[3px] rounded-full bg-ink shadow transition-transform data-[checked]:translate-x-6 data-[checked]:bg-amber-ink" />
        </Switch.Root>
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
