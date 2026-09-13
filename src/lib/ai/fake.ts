import type { Drafter, Transcriber } from "./types";

// Deterministic stand-ins for e2e tests (AI_FAKE=1, never in production).
// The draft is derived from the inputs so tests can assert carry-forward and
// auto-tagging without a network call.

export const fakeTranscriber: Transcriber = {
  name: "fake",
  async transcribe() {
    return { text: "(fake transcript)" };
  },
};

export const fakeDrafter: Drafter = {
  name: "fake",
  configured: true,
  async draft({ previous, roster }) {
    const teammate = roster[0];
    return {
      previous: previous.map((p, i) => ({ key: p.key, status: i === 0 ? "done" : "not_done" })),
      yesterday: [{ text: "Recorded a video check-in" }],
      today: [{ text: "Write the release notes" }],
      blockers: teammate ? [{ text: `Waiting on ${teammate.name.split(/\s+/)[0]} for a review`, continuesKey: null }] : [],
      mentions: teammate ? [{ userId: teammate.userId, heardAs: teammate.name }] : [],
      bullets: ["Recorded a video check-in", "Writing the release notes today"],
    };
  },
};
