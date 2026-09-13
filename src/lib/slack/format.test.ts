import { describe, expect, it } from "vitest";
import { digestMessage, escapeSlack, reminderMessage } from "./format";

describe("escapeSlack", () => {
  it("escapes Slack control characters", () => {
    expect(escapeSlack("<!channel> & <@U1>")).toBe("&lt;!channel&gt; &amp; &lt;@U1&gt;");
  });
});

describe("digestMessage", () => {
  const base = { teamName: "Platform", dateLabel: "Mon 14 Sep", url: "https://app.test/o/t?day=2026-09-14" };

  it("summarises who's in, plans and open blockers", () => {
    const msg = digestMessage({
      ...base,
      expected: 3,
      entries: [
        {
          name: "Mia",
          today: "- [ ] Ship **billing**\n- [ ] Review [@Ken](mention:u2)\n- [x] Standup\n- [ ] Docs",
          blockers: "- [ ] Waiting on <keys>\n- [x] Old one",
        },
        { name: "Ken", today: "", blockers: "" },
      ],
    });
    expect(msg.text).toBe("Platform · Mon 14 Sep: 2 of 3 checked in, 1 blocker");
    const json = JSON.stringify(msg.blocks);
    expect(json).toContain("Waiting on &lt;keys&gt; — _Mia_");
    expect(json).not.toContain("Old one");
    expect(json).toContain("• Ship billing");
    expect(json).toContain("• Review @Ken");
    expect(json).toContain("_+1 more_");
    expect(json).toContain(base.url);
  });

  it("never mentions @channel through user text", () => {
    const msg = digestMessage({ ...base, expected: 1, entries: [{ name: "<!here>", today: "- <!channel>", blockers: "" }] });
    expect(JSON.stringify(msg.blocks)).not.toMatch(/<!(channel|here)>/);
  });
});

describe("reminderMessage", () => {
  it("links to the check-in", () => {
    const msg = reminderMessage({ teamName: "Platform", closesAt: "11:00", url: "https://app.test/check-in" });
    expect(msg.text).toBe("Your Platform check-in window is open until 11:00.");
    expect(JSON.stringify(msg.blocks)).toContain("https://app.test/check-in");
  });
});
