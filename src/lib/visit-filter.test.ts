import { describe, expect, it } from "vitest";
import { shouldCount } from "./visit-filter";

const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";

describe("shouldCount", () => {
  it("counts campaign-tagged visits and guide pages from browsers", () => {
    expect(shouldCount("/", { source: "linkedin" }, browser)).toBe(true);
    expect(shouldCount("/guides/async-standup-template", null, browser)).toBe(true);
    expect(shouldCount("/guides", null, browser)).toBe(true);
  });

  it("skips untagged landing visits, bots and missing user agents", () => {
    expect(shouldCount("/", null, browser)).toBe(false);
    expect(shouldCount("/", { source: "hn" }, "Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(false);
    expect(shouldCount("/guides/x", null, "LinkedInBot/1.0")).toBe(false);
    expect(shouldCount("/guides/x", null, null)).toBe(false);
  });
});
