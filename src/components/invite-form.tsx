"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MarkLoader } from "@/components/brand/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { inviteMembers, type InviteResult } from "@/lib/actions/onboarding";

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState<InviteResult | null, FormData>(inviteMembers, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
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
        Separate with commas or spaces. They sign in with that email and land straight in this team.
      </p>
      {state && <Result state={state} />}
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

function Result({ state }: { state: InviteResult }) {
  if (!state.ok) {
    return (
      <p className="text-sm text-danger" role="alert">
        {state.error}
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
