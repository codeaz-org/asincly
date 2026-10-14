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
