import { fakeDrafter, fakeTranscriber } from "./fake";
import { groqDrafter, groqSummarizer, groqTranscriber } from "./groq";
import { noopDrafter, noopSummarizer, noopTranscriber } from "./noop";
import type { AI } from "./types";

// Resolve providers at call time (env only guaranteed at runtime).
//   AI_FAKE=1 (dev/test only) → deterministic fakes
//   GROQ_API_KEY              → Groq Whisper + Llama
//   otherwise                 → noop (pipeline runs, drafts are empty)
// OpenAI / Anthropic / local Whisper adapters slot in here.

function fakeEnabled(): boolean {
  return process.env.AI_FAKE === "1" && process.env.NODE_ENV !== "production";
}

export async function getAI(): Promise<AI> {
  if (fakeEnabled()) return { transcriber: fakeTranscriber, summarizer: noopSummarizer, drafter: fakeDrafter };
  if (process.env.GROQ_API_KEY) {
    return { transcriber: groqTranscriber, summarizer: groqSummarizer, drafter: groqDrafter };
  }
  return { transcriber: noopTranscriber, summarizer: noopSummarizer, drafter: noopDrafter };
}

export function aiConfigured(): boolean {
  return fakeEnabled() || !!process.env.GROQ_API_KEY;
}

export type {
  AI,
  Drafter,
  Summarizer,
  Transcriber,
  TranscribeInput,
  TranscribeResult,
  SummarizeInput,
  Summary,
} from "./types";
export type { CheckInDraft, DraftInput, PrevItem, RosterEntry, Sections } from "./draft-schema";
