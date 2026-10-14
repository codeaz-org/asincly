"use client";

import { SettingToggle } from "@/components/settings/org-security";
import { setTeamAi } from "@/lib/actions/team-admin";

export function AiCard({ teamId, on }: { teamId: string; on: boolean }) {
  return (
    <SettingToggle
      title="AI drafting"
      hint="Recordings are transcribed by an AI provider and turned into a draft the author reviews. Off: videos stay, nothing is sent, everyone writes their own."
      checked={on}
      onChange={(next) => setTeamAi({ teamId, on: next })}
    />
  );
}
