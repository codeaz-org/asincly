import { describe, expect, it } from "vitest";
import { reactionNotice } from "./reaction-notice";

describe("reactionNotice", () => {
  it("names up to two people, then counts the rest", () => {
    expect(reactionNotice([{ name: "Lena", emoji: ["🎉"] }], false).title).toBe("Lena reacted to your check-in");
    expect(reactionNotice([{ name: "Lena", emoji: [] }, { name: "Sam", emoji: [] }], true).title).toBe(
      "Lena and Sam reacted to your reply",
    );
    const four = ["Lena", "Sam", "Ana", "Bo"].map((name) => ({ name, emoji: [] }));
    expect(reactionNotice(four, false).title).toBe("Lena, Sam and 2 others reacted to your check-in");
    expect(reactionNotice(four.slice(0, 3), false).title).toBe("Lena, Sam and 1 other reacted to your check-in");
  });

  it("lists each emoji once", () => {
    expect(reactionNotice([{ name: "Lena", emoji: ["🎉", "👍"] }, { name: "Sam", emoji: ["🎉"] }], false).body).toBe("🎉 👍");
  });
});
