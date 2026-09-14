"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "cn";
import { MarkLoader } from "@/components/brand/loader";
import { LogoMark } from "@/components/brand/mark";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { MIN_WINDOW_MINUTES } from "@/lib/time";

const STEPS = [
  { key: "you", question: "What should your team call you?", hint: "Shown on your check-ins." },
  { key: "org", question: "What's the company called?", hint: "The organization holds your teams." },
  { key: "team", question: "Name your first team.", hint: "Where check-ins happen. Add more later." },
  { key: "cadence", question: "How often do you check in?", hint: "Times are in each teammate's own time zone." },
] as const;

const PRESETS = [
  ["weekdays", "Weekdays"],
  ["daily", "Every day"],
  ["mwf", "M · W · F"],
  ["weekly", "Weekly"],
  ["custom", "Custom"],
] as const;

// One question per screen. Every field stays mounted (only hidden) so the
// single server action receives the full form, same field names as before.
export function OnboardingWizard({ email, tz }: { email: string; tz: string }) {
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<string>("weekdays");
  const formRef = useRef<HTMLFormElement | null>(null);
  const last = step === STEPS.length - 1;

  function next() {
    const form = formRef.current;
    if (!form) return;
    // Validate only the visible step's inputs before moving on.
    const fields = form.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] input`);
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <form
      ref={formRef}
      action={completeOnboarding}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !last && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          next();
        }
      }}
      className="min-h-dvh flex flex-col"
    >
      <header className="h-16 px-5 sm:px-8 flex items-center gap-4 border-b border-line">
        <Logo size={24} className="text-ink" href={null} />
        <span className="flex-1" />
        <span className="text-xs text-soft hidden sm:inline">{email}</span>
        <LogoMark size={26} progress={(step + 1) / STEPS.length} className="text-ink" title={`Step ${step + 1} of ${STEPS.length}`} />
      </header>
      <div className="h-0.5 bg-line">
        <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <main className="flex-1 w-full max-w-xl mx-auto px-5 sm:px-8 py-12 sm:py-20">
        <p className="kicker mb-3">
          Set up · {step + 1} of {STEPS.length}
        </p>
        {STEPS.map((s, i) => (
          <div key={s.key} data-step={i} hidden={i !== step} className="space-y-8 animate-rise-in">
            <div className="space-y-2">
              <h1 className="display text-4xl sm:text-5xl text-ink">{s.question}</h1>
              <p className="text-soft">{s.hint}</p>
            </div>

            {s.key === "you" && (
              <Input name="yourName" aria-label="Your name" placeholder="Your name" required autoFocus maxLength={80} className="h-14 text-lg" />
            )}
            {s.key === "org" && <Input name="orgName" aria-label="Organization" placeholder="Acme, Inc." required maxLength={80} className="h-14 text-lg" />}
            {s.key === "team" && <Input name="teamName" aria-label="Team" placeholder="Platform" required maxLength={80} className="h-14 text-lg" />}
            {s.key === "cadence" && (
              <div className="space-y-5">
                <input type="hidden" name="scheduleName" value="Daily check-in" />
                <div role="radiogroup" aria-label="Cadence" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map(([val, label]) => (
                    <label
                      key={val}
                      className={cn(
                        "cursor-pointer rounded-xl border px-3 py-3.5 text-center text-sm transition has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-amber",
                        preset === val ? "border-amber/60 bg-amber/[0.08] text-ink" : "border-line text-soft hover:text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="preset"
                        value={val}
                        checked={preset === val}
                        onChange={() => setPreset(val)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {preset === "custom" && (
                  <Input name="customRrule" aria-label="Custom RRULE" required placeholder="FREQ=WEEKLY;BYDAY=TU,TH" className="font-mono text-sm" />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-2">
                    <span className="kicker block">Window opens</span>
                    <Input name="windowOpen" type="time" defaultValue="09:00" required className="font-mono" />
                  </label>
                  <label className="space-y-2">
                    <span className="kicker block">Closes</span>
                    <Input name="windowClose" type="time" defaultValue="11:00" required className="font-mono" />
                  </label>
                </div>
                <p className="text-xs text-soft">
                  Your zone: <span className="font-mono text-ink">{tz}</span>. Teammates in Tokyo get the same window in Tokyo time.
                  At least {MIN_WINDOW_MINUTES} minutes long.
                </p>
              </div>
            )}
          </div>
        ))}

        <div className="mt-12 flex items-center gap-3">
          {step > 0 && (
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
          <span className="flex-1" />
          {last ? (
            <CreateButton />
          ) : (
            <Button type="button" variant="primary" size="lg" onClick={next}>
              Continue <ArrowRight />
            </Button>
          )}
        </div>
      </main>
    </form>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" disabled={pending}>
      {pending ? <MarkLoader size="xs" /> : <Check />}
      Create team
    </Button>
  );
}
