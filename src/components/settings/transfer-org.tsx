"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { transferOrgOwnership } from "@/lib/actions/team-admin";

// Org owner hands billing and "delete organization" to someone who already
// owns or administers a team in it.
export function TransferOrg({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="p-4 sm:p-5 space-y-3"
      action={(fd) => {
        const email = String(fd.get("email") ?? "");
        if (!window.confirm(`Make ${email} the owner of ${orgName}? They take over billing and can delete it.`)) return;
        startTransition(async () => {
          const res = await transferOrgOwnership({ orgId, email });
          setError(res.ok ? null : res.error);
        });
      }}
    >
      <div>
        <p className="text-[15px] font-medium text-ink">Transfer {orgName}</p>
        <p className="text-sm text-soft">
          The new owner manages billing and can delete the organization. They must own or administer a team here.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="transfer-email" className="sr-only">
          New owner&rsquo;s email
        </label>
        <Input id="transfer-email" name="email" type="email" required placeholder="new-owner@company.com" className="flex-1" />
        <Button type="submit" variant="secondary" disabled={pending}>
          Transfer
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
