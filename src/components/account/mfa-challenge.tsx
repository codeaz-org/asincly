"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { verifySecondFactor } from "@/lib/actions/account-security";

export function MfaChallenge() {
  const [state, action, pending] = useActionState(verifySecondFactor, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="code" className="sr-only">
        Code
      </label>
      <Input
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode="text"
        placeholder="123456 or a backup code"
        className="font-mono text-center tracking-widest"
      />
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        Continue
      </Button>
    </form>
  );
}
