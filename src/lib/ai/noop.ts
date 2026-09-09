import type { AI, Summarizer, Transcriber } from "./types";

// Fallback used when no external API keys are configured. Keeps the whole
// pipeline runnable end-to-end in dev without a paid Deepgram/Anthropic
// account — the summary just says the recording exists.

export const noopTranscriber: Transcriber = {
  name: "noop",
  async transcribe() {
    return {
      text: "[transcription disabled — set DEEPGRAM_API_KEY or OPENAI_API_KEY to enable]",
    };
  },
};

export const noopSummarizer: Summarizer = {
  name: "noop",
  async summarize({ note }) {
    const bullets = note
      .split("\n")
      .map((l) => l.replace(/^[-*+]\s*(\[.\]\s*)?/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);
    return {
      bullets: bullets.length > 0 ? bullets : ["Recording captured."],
      actionItems: [],
      blockers: [],
      mentions: [],
    };
  },
};

export const noopAI: AI = {
  transcriber: noopTranscriber,
  summarizer: noopSummarizer,
};
