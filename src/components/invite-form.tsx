"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteMembers, type InviteResult } from "@/lib/actions/onboarding";

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, formAction] = useActionState<InviteResult | null, FormData>(
    inviteMembers,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex gap-2">
        <input
          name="emails"
          placeholder="alice@company.com, bob@company.com"
          required
          autoComplete="off"
          className="flex-1 h-11 rounded-md bg-white/[0.02] border border-white/10 px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
        />
        <SubmitButton />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Comma, semicolon, or whitespace separated. Optional — you can invite people
        later. Invitees sign in at{" "}
        <code className="mx-0.5 font-mono">/sign-in</code> with the same email.
      </p>

      {state && <Result state={state} />}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Inviting…" : "Invite"}
    </button>
  );
}

function Result({ state }: { state: InviteResult }) {
  if (!state.ok) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {state.error}
      </p>
    );
  }
  const bits: string[] = [];
  if (state.added.length) bits.push(`Added ${state.added.length}`);
  if (state.alreadyIn.length) bits.push(`${state.alreadyIn.length} already in team`);
  if (state.invalid.length) bits.push(`${state.invalid.length} invalid`);
  if (bits.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground space-y-1" role="status">
      <p className="text-emerald-400">✓ {bits.join(" · ")}</p>
      {state.added.length > 0 && (
        <p className="font-mono truncate">→ {state.added.join(", ")}</p>
      )}
      {state.alreadyIn.length > 0 && (
        <p className="font-mono truncate opacity-70">
          skip · {state.alreadyIn.join(", ")}
        </p>
      )}
      {state.invalid.length > 0 && (
        <p className="font-mono truncate text-destructive/80">
          invalid · {state.invalid.join(", ")}
        </p>
      )}
    </div>
  );
}
