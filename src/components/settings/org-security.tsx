"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { resetMemberTotp, setRequire2fa, setSsoPolicy } from "@/lib/actions/account-security";

export function SettingToggle({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(checked);
  const titleId = useId();
  const hintId = useId();
  return (
    <div className="p-4 sm:p-5 space-y-2">
      <div className="flex items-center gap-4">
        <span className="flex-1">
          <span id={titleId} className="block text-[15px] font-medium text-ink">
            {title}
          </span>
          <span id={hintId} className="block text-sm text-soft">
            {hint}
          </span>
        </span>
        <Switch.Root
          checked={on}
          onCheckedChange={(next) =>
            startTransition(async () => {
              setError(null);
              setOn(next);
              const res = await onChange(next);
              if (!res.ok) setError(res.error ?? "Couldn't save");
            })
          }
          aria-labelledby={titleId}
          aria-describedby={hintId}
          className="relative inline-flex h-7 w-12 shrink-0 rounded-full border border-line-strong bg-ink/[0.08] transition-colors data-[checked]:bg-amber data-[checked]:border-amber outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          <Switch.Thumb className="block size-5 translate-x-1 translate-y-[3px] rounded-full bg-ink shadow transition-transform data-[checked]:translate-x-6 data-[checked]:bg-amber-ink" />
        </Switch.Root>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function OrgSecurity({
  orgId,
  require2fa,
  requireSso,
  ssoDomain,
}: {
  orgId: string;
  require2fa: boolean;
  requireSso: boolean;
  ssoDomain: string | null;
}) {
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <SettingToggle
        title="Require two-factor for owners and admins"
        hint="They set up an authenticator app before they can manage anything. Members aren't affected."
        checked={require2fa}
        onChange={(on) => setRequire2fa({ orgId, on })}
      />
      <SettingToggle
        title={requireSso && ssoDomain ? `Require Google sign-in for @${ssoDomain}` : "Require Google sign-in for your domain"}
        hint="People at your email domain sign in with your Google Workspace; magic links stop working for them."
        checked={requireSso}
        onChange={(required) => setSsoPolicy({ orgId, required })}
      />
      <form
        className="p-4 sm:p-5 space-y-2"
        action={(fd) =>
          startTransition(async () => {
            const res = await resetMemberTotp({ orgId, email: fd.get("email") });
            setResetMsg(res.ok ? { ok: true, text: "Reset. They're signed out and set up two-factor again." } : { ok: false, text: res.error });
          })
        }
      >
        <p className="text-[15px] font-medium text-ink">Reset someone&rsquo;s two-factor</p>
        <p className="text-sm text-soft">For a teammate who lost their phone and their backup codes.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input name="email" type="email" required placeholder="teammate@company.com" aria-label="Their email" className="flex-1" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Reset
          </Button>
        </div>
        {resetMsg && (
          <p role={resetMsg.ok ? "status" : "alert"} className={`text-xs ${resetMsg.ok ? "text-soft" : "text-danger"}`}>
            {resetMsg.text}
          </p>
        )}
      </form>
    </>
  );
}
