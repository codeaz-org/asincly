import { groqSummarizer, groqTranscriber } from "./groq";
import { noopAI, noopSummarizer, noopTranscriber } from "./noop";
import type { AI, Summarizer, Transcriber } from "./types";

// Resolve providers at call time (env only guaranteed at runtime).
// Order per-capability:
//   Groq (free, single key covers both)  →  noop fallback
// Deepgram / Anthropic / OpenAI / Whisper adapters slot in here when a
// team wants a paid or self-hosted stack.

function pickTranscriber(): Transcriber {
  if (process.env.GROQ_API_KEY) return groqTranscriber;
  return noopTranscriber;
}

function pickSummarizer(): Summarizer {
  if (process.env.GROQ_API_KEY) return groqSummarizer;
  return noopSummarizer;
}

export async function getAI(): Promise<AI> {
  const transcriber = pickTranscriber();
  const summarizer = pickSummarizer();
  if (transcriber === noopTranscriber && summarizer === noopSummarizer) return noopAI;
  return { transcriber, summarizer };
}

export type {
  AI,
  Summarizer,
  Transcriber,
  TranscribeInput,
  TranscribeResult,
  SummarizeInput,
  Summary,
} from "./types";
