import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfigured, aiProcessorLabel, getAI } from "./index";
import { CheckInDraftSchema } from "./draft-schema";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI provider selection", () => {
  it("never uses the fake AI in production, even with AI_FAKE set", async () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GROQ_API_KEY", "");
    const ai = await getAI();
    expect(aiConfigured()).toBe(false);
    expect(aiProcessorLabel()).toBeNull();
    expect((await ai.transcriber.transcribe({ audioUrl: "x", mimeType: "audio/webm" })).text).toBe("");
  });

  it("names the provider audio goes to when one is configured", () => {
    vi.stubEnv("AI_FAKE", "");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    expect(aiProcessorLabel()).toMatch(/Groq/);
  });
});

describe("model output is untrusted", () => {
  it("rejects the wrong shape", () => {
    expect(CheckInDraftSchema.safeParse({ today: "ship it" }).success).toBe(false);
    expect(CheckInDraftSchema.safeParse({ previous: [{ key: "a", status: "maybe" }] }).success).toBe(false);
  });

  it("rejects oversized output instead of storing it", () => {
    expect(CheckInDraftSchema.safeParse({ today: [{ text: "x".repeat(241) }] }).success).toBe(false);
    expect(CheckInDraftSchema.safeParse({ today: Array.from({ length: 21 }, () => ({ text: "x" })) }).success).toBe(false);
    expect(CheckInDraftSchema.safeParse({ bullets: Array.from({ length: 7 }, () => "x") }).success).toBe(false);
  });

  it("fills missing sections with empty lists", () => {
    const parsed = CheckInDraftSchema.parse({});
    expect(parsed).toEqual({ previous: [], yesterday: [], today: [], blockers: [], mentions: [], bullets: [] });
  });
});

describe("Groq drafter", () => {
  const input = { previous: [], openBlockers: [], roster: [], typed: { yesterday: "", today: "", blockers: "" }, authorTz: "UTC", hints: {}, notes: "", transcript: "shipped it" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to another model when the account can't use the default", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_CHAT_MODEL", "");
    const models: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const { model } = JSON.parse(String(init.body)) as { model: string };
      models.push(model);
      if (models.length === 1) return new Response(JSON.stringify({ error: { code: "model_not_found" } }), { status: 404 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ yesterday: [{ text: "Shipped it" }] }) } }] }));
    });
    const { groqDrafter } = await import("./groq");
    const draft = await groqDrafter.draft(input);
    expect(models).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
    expect(draft.yesterday[0].text).toBe("Shipped it");
  });

  it("reports Groq's error code, never the response body", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_CHAT_MODEL", "some/model");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "secret transcript" } }), { status: 429 }));
    const { groqDrafter } = await import("./groq");
    await expect(groqDrafter.draft(input)).rejects.toThrow("groq draft 429 rate_limit_exceeded (some/model)");
  });
});

describe("draft replies", () => {
  it("finds the JSON object inside prose or a code fence", async () => {
    const { jsonObjectIn } = await import("./groq");
    expect(jsonObjectIn('Here you go:\n```json\n{"bullets":["a"]}\n```')).toEqual({ bullets: ["a"] });
    expect(() => jsonObjectIn("no json here")).toThrow();
  });

  it("retries once when Groq rejects the model's JSON", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ error: { code: "json_validate_failed" } }), { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"today":[{"text":"Ship it"}]}' } }] }));
    });
    const { groqDrafter } = await import("./groq");
    const draft = await groqDrafter.draft({ previous: [], openBlockers: [], roster: [], typed: { yesterday: "", today: "", blockers: "" }, authorTz: "UTC", hints: {}, notes: "", transcript: "x" });
    expect(calls).toBe(2);
    expect(draft.today[0].text).toBe("Ship it");
    vi.unstubAllGlobals();
  });
});
