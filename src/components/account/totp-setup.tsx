"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { confirmTotpEnrolment, disableTotp, startTotpEnrolment } from "@/lib/actions/account-security";

type Step = { kind: "off" } | { kind: "scan"; secret: string; svg: string } | { kind: "codes"; codes: string[] } | { kind: "on" };

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<Step>(enabled ? { kind: "on" } : { kind: "off" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      await fn();
    });

  const errorLine = error && (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  );

  if (step.kind === "off") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-soft">Ask for a code from an authenticator app (1Password, Google Authenticator, …) when you sign in.</p>
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const res = await startTotpEnrolment();
              if (res.ok) setStep({ kind: "scan", secret: res.secret, svg: res.svg });
              else setError(res.error);
            })
          }
        >
          Set up two-factor
        </Button>
        {errorLine}
      </div>
    );
  }

  if (step.kind === "scan") {
    return (
      <form
        className="space-y-4"
        action={(fd) =>
          run(async () => {
            const res = await confirmTotpEnrolment(fd.get("code"));
            if (res.ok) setStep({ kind: "codes", codes: res.backupCodes });
            else setError(res.error);
          })
        }
      >
        <p className="text-sm text-soft">Scan this with your authenticator app, then enter the code it shows.</p>
        <div className="flex flex-wrap items-center gap-4">
          {/* SVG rendered on the server from the otpauth:// URI; no user input in it. */}
          <div className="size-40 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: step.svg }} />
          <p className="text-xs text-soft">
            Can&rsquo;t scan? Enter this key:
            <br />
            <code className="font-mono text-ink break-all">{step.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Input name="code" required autoComplete="one-time-code" inputMode="numeric" placeholder="123456" className="font-mono w-36" />
          <Button type="submit" variant="primary" disabled={pending}>
            Turn on
          </Button>
        </div>
        {errorLine}
      </form>
    );
  }

  if (step.kind === "codes") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink">
          Two-factor is on. Save these backup codes somewhere safe: each one works once if you lose your phone. They won&rsquo;t be
          shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-ink">
          {step.codes.map((c) => (
            <li key={c} className="rounded-lg border border-line px-3 py-1.5">
              {c}
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setStep({ kind: "on" })}>
          I&rsquo;ve saved them
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      action={(fd) =>
        run(async () => {
          const res = await disableTotp(fd.get("code"));
          if (res.ok) setStep({ kind: "off" });
          else setError(res.error);
        })
      }
    >
      <p className="flex items-center gap-2 text-sm text-ink">
        <ShieldCheck className="size-4 text-amber" /> Two-factor is on.
      </p>
      <div className="flex gap-2">
        <Input name="code" required autoComplete="one-time-code" placeholder="Current code" className="font-mono w-40" aria-label="Current code" />
        <Button type="submit" variant="secondary" disabled={pending}>
          Turn off
        </Button>
      </div>
      {errorLine}
    </form>
  );
}
