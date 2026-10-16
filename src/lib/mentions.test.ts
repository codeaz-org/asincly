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

describe("editor view of mentions", () => {
  const known = [
    { userId: "u1", name: "Anton Zaharia" },
    { userId: "u3", name: "Sam Miller" },
    { userId: "u5", name: "Sam" },
  ];
  it("shows @Name and stores the link, round-tripping exactly", async () => {
    const { toDisplay, toMarkup } = await import("./mentions");
    const md = "- Need [@Anton Zaharia](mention:u1) and [@Sam Miller](mention:u3), not email@sam.io";
    const display = toDisplay(md);
    expect(display).toBe("- Need @Anton Zaharia and @Sam Miller, not email@sam.io");
    expect(toMarkup(display, known)).toBe(md);
  });

  it("a name edited mid-way stops being a mention", async () => {
    const { toMarkup } = await import("./mentions");
    expect(toMarkup("ask @Anton Zahari", known)).toBe("ask @Anton Zahari");
    expect(toMarkup("ask @Sam", known)).toBe("ask [@Sam](mention:u5)");
  });
});
