import { EMPTY_DRAFT } from "./draft-schema";
import type { AI, Drafter, Summarizer, Transcriber } from "./types";

// Fallback used when no AI key is configured. The pipeline still runs
// end-to-end; it just produces NOTHING visible. Echoing the written note
// back as fake "summary" bullets reads as duplicated noise in the feed,
// so the noop summarizer stays silent and the feed shows only the note
// and the video player. Set GROQ_API_KEY for real summaries.

export const noopTranscriber: Transcriber = {
  name: "noop",
  async transcribe() {
    return { text: "" };
  },
};

export const noopSummarizer: Summarizer = {
  name: "noop",
  async summarize() {
    return { bullets: [], actionItems: [], blockers: [], mentions: [] };
  },
};

export const noopDrafter: Drafter = {
  name: "noop",
  configured: false,
  async draft() {
    return EMPTY_DRAFT;
  },
};

export const noopAI: AI = {
  transcriber: noopTranscriber,
  summarizer: noopSummarizer,
  drafter: noopDrafter,
};
