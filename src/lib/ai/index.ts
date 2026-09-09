import { noopAI, noopSummarizer, noopTranscriber } from "./noop";
import type { AI, Summarizer, Transcriber } from "./types";

// Resolve providers at call time (env vars only guaranteed available at
// runtime). Order: env-configured adapter → noop fallback. Adapters for
// Deepgram / Anthropic are added lazily inside pickTranscriber /
// pickSummarizer to avoid pulling their SDKs into the client bundle.

async function pickTranscriber(): Promise<Transcriber> {
  // ponytail: Deepgram/OpenAI/Whisper adapters live behind these keys and
  // are added in the AI processing route where they're actually needed.
  return noopTranscriber;
}

async function pickSummarizer(): Promise<Summarizer> {
  return noopSummarizer;
}

export async function getAI(): Promise<AI> {
  const [transcriber, summarizer] = await Promise.all([
    pickTranscriber(),
    pickSummarizer(),
  ]);
  if (transcriber === noopTranscriber && summarizer === noopSummarizer) return noopAI;
  return { transcriber, summarizer };
}

export type { AI, Summarizer, Transcriber, TranscribeInput, TranscribeResult, SummarizeInput, Summary } from "./types";
