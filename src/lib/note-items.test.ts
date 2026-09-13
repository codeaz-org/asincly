import { describe, expect, it } from "vitest";
import { blockerItems, itemKey, noteItems, plainText, setTaskChecked, taskLines, taskStats } from "./note-items";

describe("noteItems", () => {
  it("reads bullets, numbered and task items", () => {
    expect(noteItems("- one\n* two\n1. three\n- [ ] four\n- [x] five")).toEqual([
      { text: "one", checked: null },
      { text: "two", checked: null },
      { text: "three", checked: null },
      { text: "four", checked: false },
      { text: "five", checked: true },
    ]);
  });

  it("falls back to lines when there is no list", () => {
    expect(noteItems("Waiting on staging keys\n\nand the DNS change")).toEqual([
      { text: "Waiting on staging keys", checked: null },
      { text: "and the DNS change", checked: null },
    ]);
  });

  it("ignores empty items and headings", () => {
    expect(noteItems("## Blockers\n\n")).toEqual([]);
    expect(noteItems("- \n- real")).toEqual([{ text: "real", checked: null }]);
  });
});

describe("blockerItems", () => {
  it("skips resolved task items and extracts mentions", () => {
    const items = blockerItems("- [x] old\n- keys from [@Amelia Silva](mention:u_amelia)");
    expect(items).toHaveLength(1);
    expect(items[0].mentions).toEqual([{ name: "Amelia Silva", userId: "u_amelia" }]);
    expect(items[0].key).toBe(itemKey("keys from [@Amelia Silva](mention:u_amelia)"));
  });
});

describe("itemKey", () => {
  it("is stable across case, whitespace and trailing punctuation", () => {
    expect(itemKey("Waiting on  staging keys.")).toBe(itemKey("waiting on staging keys"));
  });
  it("differs for different text", () => {
    expect(itemKey("staging keys")).not.toBe(itemKey("prod keys"));
  });
});

describe("taskStats", () => {
  it("counts tasks when present", () => {
    expect(taskStats("- [ ] a\n- [x] b\n- note")).toEqual({ total: 2, done: 1 });
  });
  it("counts bullets when there are no tasks", () => {
    expect(taskStats("- a\n- b")).toEqual({ total: 2, done: 0 });
  });
  it("is zero for empty", () => {
    expect(taskStats("")).toEqual({ total: 0, done: 0 });
  });
});

describe("plainText", () => {
  it("flattens mentions, links and emphasis", () => {
    expect(plainText("**ship** it with [@Sam](mention:u1) see [docs](https://x.y)")).toBe(
      "ship it with @Sam see docs",
    );
  });
});

describe("taskLines / setTaskChecked", () => {
  const md = "Shipped\n- [ ] review PR\n  - [x] nested done\n- plain";
  it("finds task lines with their positions", () => {
    expect(taskLines(md)).toEqual([
      { line: 1, text: "review PR", checked: false },
      { line: 2, text: "nested done", checked: true },
    ]);
  });
  it("toggles one line and leaves the rest alone", () => {
    expect(setTaskChecked(md, 1, true)).toBe("Shipped\n- [x] review PR\n  - [x] nested done\n- plain");
    expect(setTaskChecked(md, 2, false)).toBe("Shipped\n- [ ] review PR\n  - [ ] nested done\n- plain");
    expect(setTaskChecked(md, 3, true)).toBe(md);
  });
});
