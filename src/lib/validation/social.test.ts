import { describe, expect, it } from "vitest";
import {
  AddCommentSchema,
  BlockerActionSchema,
  SetAwaySchema,
  ToggleReactionSchema,
  VideoSkipSchema,
  isSingleEmoji,
} from "./social";

const uuid = "4f1c2d7e-9a55-4c1e-8f7b-0a2b3c4d5e6f";

describe("social schemas", () => {
  it("trims comments and rejects empty or long ones", () => {
    expect(AddCommentSchema.parse({ checkInId: uuid, body: "  hi  " }).body).toBe("hi");
    expect(AddCommentSchema.safeParse({ checkInId: uuid, body: "   " }).success).toBe(false);
    expect(AddCommentSchema.safeParse({ checkInId: uuid, body: "x".repeat(2001) }).success).toBe(false);
  });

  it("accepts exactly one emoji as a reaction", () => {
    expect(ToggleReactionSchema.safeParse({ checkInId: uuid, emoji: "🎉" }).success).toBe(true);
    expect(ToggleReactionSchema.safeParse({ checkInId: uuid, commentId: uuid, emoji: "👍🏽" }).success).toBe(true);
    expect(ToggleReactionSchema.safeParse({ checkInId: uuid, emoji: "nice" }).success).toBe(false);
  });

  it("recognises emoji structurally", () => {
    for (const ok of ["😀", "👍🏽", "👨‍👩‍👧‍👦", "🇷🇴", "❤️", "#️⃣", "🏳️‍🌈"]) expect(isSingleEmoji(ok), ok).toBe(true);
    for (const bad of ["", "a", ":tada:", "🎉🎉", "hi🎉", "<script>", "1"]) expect(isSingleEmoji(bad), bad).toBe(false);
  });

  it("validates video skip reasons", () => {
    expect(VideoSkipSchema.parse({ reason: "noisy", note: "  " }).note).toBeNull();
    expect(VideoSkipSchema.parse({ reason: "noisy", note: null }).note).toBeNull();
    expect(VideoSkipSchema.safeParse({ reason: "lazy" }).success).toBe(false);
  });

  it("requires an 8-hex blocker key", () => {
    expect(BlockerActionSchema.safeParse({ checkInId: uuid, itemKey: "0a1b2c3d" }).success).toBe(true);
    expect(BlockerActionSchema.safeParse({ checkInId: uuid, itemKey: "'; drop" }).success).toBe(false);
  });

  it("validates away ranges", () => {
    const base = { teamId: uuid, startsOn: "2026-09-14", endsOn: "2026-09-18" };
    expect(SetAwaySchema.parse({ ...base, note: "  " }).note).toBeNull();
    expect(SetAwaySchema.safeParse({ ...base, endsOn: "2026-09-13" }).success).toBe(false);
    expect(SetAwaySchema.safeParse({ ...base, endsOn: "2027-01-01" }).success).toBe(false);
    expect(SetAwaySchema.safeParse({ ...base, startsOn: "14/09/2026" }).success).toBe(false);
  });
});
