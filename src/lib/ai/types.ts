// Pluggable AI provider surface. Adapters are wired in src/lib/ai/index.ts.
// Every adapter must be swappable per-deployment (env-driven).

export type TranscribeInput = {
  /** Signed URL or raw bytes reference. Adapters accept whichever is easier. */
  audioUrl?: string;
  audioBytes?: Uint8Array;
  mimeType: string;
};

export type TranscribeResult = {
  text: string;
  language?: string;
  durationSec?: number;
};

export type Transcriber = {
  name: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
};

export type SummarizeInput = {
  /** Transcript text (already decrypted for the model). */
  transcript: string;
  /** Freeform Y/T/B markdown the author wrote alongside the recording. */
  note: string;
  /** IANA tz of the check-in owner, so times in the transcript are readable. */
  authorTz: string;
};

export type Summary = {
  bullets: string[];
  actionItems: string[];
  blockers: string[];
  mentions: string[];
};

export type Summarizer = {
  name: string;
  summarize(input: SummarizeInput): Promise<Summary>;
};

export type AI = {
  transcriber: Transcriber;
  summarizer: Summarizer;
};
