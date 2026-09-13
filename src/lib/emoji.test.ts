import { describe, expect, it } from "vitest";
import { searchShortcodes } from "./emoji";

const index: Array<[string, string]> = [
  ["+1", "👍"],
  ["tada", "🎉"],
  ["taco", "🌮"],
  ["thumbsup", "👍"],
  ["partying_face", "🥳"],
  ["star_struck", "🤩"],
];

describe("searchShortcodes", () => {
  it("needs at least two characters", () => {
    expect(searchShortcodes(index, "t")).toEqual([]);
  });

  it("puts prefix matches before substring matches", () => {
    expect(searchShortcodes(index, "ta").map((r) => r.code)).toEqual(["tada", "taco", "star_struck"]);
  });

  it("returns each emoji once", () => {
    expect(searchShortcodes(index, "thumbs")).toEqual([{ code: "thumbsup", emoji: "👍" }]);
  });

  it("limits results", () => {
    expect(searchShortcodes(index, "a", 2)).toEqual([]);
    expect(searchShortcodes(index, "ta", 1)).toHaveLength(1);
  });
});
