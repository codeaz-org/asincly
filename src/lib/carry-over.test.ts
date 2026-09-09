import { describe, expect, it } from "vitest";
import { carryOver } from "./carry-over";

describe("carryOver", () => {
  it("returns empty when previous is empty", () => {
    expect(carryOver("")).toEqual({ yesterday: "", today: "" });
    expect(carryOver("   \n  ")).toEqual({ yesterday: "", today: "" });
  });

  it("preserves the whole previous Today as new Yesterday", () => {
    const prev = "- [x] shipped feature\n- [ ] review PR";
    expect(carryOver(prev).yesterday).toBe(prev);
  });

  it("carries only unchecked task-list items into new Today", () => {
    const prev = "- [x] shipped feature\n- [ ] review PR\n- [ ] draft plan\n- just a note";
    expect(carryOver(prev).today).toBe("- [ ] review PR\n- [ ] draft plan");
  });

  it("tolerates asterisk bullets and extra whitespace", () => {
    const prev = "  * [ ]   thing one  \n  * [x] done";
    expect(carryOver(prev).today).toBe("- [ ] thing one");
  });
});
