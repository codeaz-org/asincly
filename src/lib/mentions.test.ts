import { describe, expect, it } from "vitest";
import { extractMentions, linkAtMentions } from "./mentions";

const roster = [
  { userId: "u1", name: "Anton Zaharia", email: "az@codeaz.org" },
  { userId: "u2", name: "Lena Ruiz", email: "lena@codeaz.org" },
  { userId: "u3", name: "Sam Miller", email: "sam.m@codeaz.org" },
  { userId: "u4", name: "Sam Ortiz", email: "sortiz@codeaz.org" },
];

describe("typed @mentions", () => {
  it("link a teammate by first name, full name or email handle, in any case", () => {
    const md = linkAtMentions("- Need @anton to provide config keys\n- Pair with @LenaRuiz, ask @sortiz.", roster);
    expect(extractMentions(md).map((m) => m.userId)).toEqual(["u1", "u2", "u4"]);
    expect(md).toContain("[@Anton Zaharia](mention:u1) to provide");
    expect(md).toMatch(/\(mention:u4\)\.$/);
  });

  it("leave ambiguous, unknown, email and existing mentions alone", () => {
    const md = "ask @sam, mail lena@codeaz.org, ping @nobody, [@Lena Ruiz](mention:u2)";
    expect(linkAtMentions(md, roster)).toBe(md);
  });
});
