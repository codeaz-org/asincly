"use client";

import { useEffect } from "react";
import { updateOwnTz } from "@/lib/actions/onboarding";

// Runs once per page load. If the browser's detected IANA tz differs from
// what's on the user row, update it silently. Users can override manually later.
export function TzDetector({ currentTz }: { currentTz: string }) {
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && detected !== currentTz) void updateOwnTz(detected);
    } catch {
      // Some very old browsers can't resolve tz — leave as-is.
    }
  }, [currentTz]);
  return null;
}
