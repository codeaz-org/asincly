"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { useFormStatus } from "react-dom";
import { MarkLoader } from "@/components/brand/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { inviteMembers, type InviteResult } from "@/lib/actions/onboarding";

export function InviteForm({
  teamId,
  guestsAllowed = true,
  billingHref = null,
  seatNote,
}: {
  teamId: string;
  /** Guests are a Pro feature on the hosted cloud. */
  guestsAllowed?: boolean;
  billingHref?: string | null;
  /** e.g. "2 of 3 members on the Free plan". */
  seatNote?: string;
}) {
  const [state, formAction] = useActionState<InviteResult | null, FormData>(inviteMembers, null);
  const [role, setRole] = useState<"member" | "guest">("member");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="role" value={role} />
      <div role="radiogroup" aria-label="Invite as" className="inline-flex rounded-xl border border-line p-0.5 text-sm">
        {(
          [
            ["member", "Member"],
            ["guest", "Guest · read-only"],
          ] as const
        ).map(([value, label]) => {
          const disabled = value === "guest" && !guestsAllowed;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              disabled={disabled}
              onClick={() => setRole(value)}
              title={disabled ? "Guests are part of Pro" : undefined}
              className={cn(
                "h-8 rounded-[10px] px-3 transition disabled:opacity-45",
                role === value ? "bg-ink/[0.08] text-ink" : "text-soft hover:text-ink",
              )}
            >
              {label}
              {disabled && <span className="ml-1.5 text-[11px] text-amber">Pro</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="invite-emails" className="sr-only">
          Email addresses
        </label>
        <Input
          id="invite-emails"
          name="emails"
          placeholder="alice@company.com, bob@company.com"
          required
          autoComplete="off"
          className="flex-1"
        />
        <SubmitButton />
      </div>
      <p className="text-xs text-soft">
        {role === "guest"
          ? "Guests can read check-ins, react and reply. They don't check in and don't count as members."
          : "Separate with commas or spaces. They sign in with that email and land straight in this team."}
        {seatNote && <span className="text-faint"> · {seatNote}</span>}
      </p>
      {state && <Result state={state} billingHref={billingHref} />}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" disabled={pending}>
      {pending ? <MarkLoader size="xs" label="Inviting" className="[&_span]:text-amber-ink" /> : "Invite"}
    </Button>
  );
}

function Result({ state, billingHref }: { state: InviteResult; billingHref: string | null }) {
  if (!state.ok) {
    return (
      <p className={cn("text-sm", state.upgrade ? "text-ink" : "text-danger")} role="alert">
        {state.error}
        {state.upgrade && billingHref && (
          <>
            {" "}
            <Link href={billingHref} className="text-amber hover:underline underline-offset-4">
              See Pro →
            </Link>
          </>
        )}
      </p>
    );
  }
  const bits: string[] = [];
  if (state.added.length) bits.push(`Added ${state.added.length}`);
  if (state.alreadyIn.length) bits.push(`${state.alreadyIn.length} already in the team`);
  if (state.invalid.length) bits.push(`${state.invalid.length} invalid`);
  if (bits.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-ink/[0.03] px-4 py-3 text-sm space-y-1" role="status">
      <p className="text-ink">{bits.join(" · ")}</p>
      {state.added.length > 0 && <p className="text-xs text-soft truncate">{state.added.join(", ")}</p>}
      {state.invalid.length > 0 && <p className="text-xs text-danger truncate">Invalid: {state.invalid.join(", ")}</p>}
    </div>
  );
}
