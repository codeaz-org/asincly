import type { Summarizer, Summary, Transcriber } from "./types";

const BASE = "https://api.groq.com/openai/v1";
const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
const CHAT_MODEL = "llama-3.3-70b-versatile";

function key(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY is not set");
  return k;
}

export const groqTranscriber: Transcriber = {
  name: "groq-whisper",
  async transcribe({ audioUrl, mimeType }) {
    if (!audioUrl) throw new Error("groq transcriber requires audioUrl");
    // Fetch the audio bytes (signed GET URL from S3/MinIO).
    const audio = await fetch(audioUrl);
    if (!audio.ok) throw new Error(`fetch audio ${audio.status}`);
    const bytes = new Uint8Array(await audio.arrayBuffer());

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType }), `recording.${extFor(mimeType)}`);
    form.append("model", TRANSCRIBE_MODEL);
    form.append("response_format", "json");

    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`groq transcribe ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { text: string };
    return { text: j.text ?? "" };
  },
};

const SYSTEM_PROMPT = `You summarize a colleague's async check-in for their team.
You get a written note (yesterday/today/blockers in markdown) plus a video transcript.
Your job: produce a compact JSON summary the team can skim in 10 seconds.

Return a JSON object with exactly these keys:
- bullets: 3-6 short bullets (max 90 chars each) of what actually happened / will happen. No filler.
- actionItems: concrete TODOs mentioned (imperative voice). Empty array if none.
- blockers: things blocking progress. Empty array if none.
- mentions: names of people referenced. Empty array if none.

Only return valid JSON, no prose around it.`;

export const groqSummarizer: Summarizer = {
  name: "groq-llama",
  async summarize({ transcript, note, authorTz }) {
    const userContent = `Author timezone: ${authorTz}\n\n--- WRITTEN NOTE ---\n${note || "(none)"}\n\n--- VIDEO TRANSCRIPT ---\n${transcript || "(none)"}`;

    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) throw new Error(`groq summarize ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = j.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<Summary>;
    return {
      bullets: array(parsed.bullets),
      actionItems: array(parsed.actionItems),
      blockers: array(parsed.blockers),
      mentions: array(parsed.mentions),
    };
  },
};

function array(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20);
}

function extFor(mime: string): string {
  const m = mime.split("/")[1]?.split(";")[0] ?? "webm";
  return m;
}
