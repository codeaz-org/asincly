import { describe, expect, it } from "vitest";
import { continueList, indentList, toggleLinePrefix, wrapSelection } from "./md-edit";

describe("continueList", () => {
  it("continues a bullet", () => {
    const v = "- first";
    const r = continueList(v, v.length)!;
    expect(r.value).toBe("- first\n- ");
    expect(r.caret).toBe(r.value.length);
  });

  it("continues a task item unchecked, even after a checked one", () => {
    const v = "- [x] done thing";
    const r = continueList(v, v.length)!;
    expect(r.value).toBe("- [x] done thing\n- [ ] ");
  });

  it("increments numbered lists", () => {
    const v = "3. third";
    const r = continueList(v, v.length)!;
    expect(r.value).toBe("3. third\n4. ");
  });

  it("clears the marker on an empty item", () => {
    const v = "- [ ] task\n- [ ] ";
    const r = continueList(v, v.length)!;
    expect(r.value).toBe("- [ ] task\n");
    expect(r.caret).toBe(r.value.length);
  });

  it("returns null on plain lines", () => {
    expect(continueList("just prose", 10)).toBeNull();
  });

  it("preserves indentation", () => {
    const v = "  - nested";
    const r = continueList(v, v.length)!;
    expect(r.value).toBe("  - nested\n  - ");
  });
});

describe("indentList", () => {
  it("indents a list line by two spaces", () => {
    const r = indentList("- item", 3, false)!;
    expect(r.value).toBe("  - item");
    expect(r.caret).toBe(5);
  });

  it("outdents", () => {
    const r = indentList("  - item", 5, true)!;
    expect(r.value).toBe("- item");
    expect(r.caret).toBe(3);
  });

  it("null on non-list lines", () => {
    expect(indentList("prose", 2, false)).toBeNull();
  });
});

describe("wrapSelection", () => {
  it("wraps a selection in bold", () => {
    const r = wrapSelection("make this bold", 5, 9, "**");
    expect(r.value).toBe("make **this** bold");
    expect([r.selStart, r.selEnd]).toEqual([7, 11]);
  });

  it("unwraps an already-wrapped selection", () => {
    const r = wrapSelection("make **this** bold", 7, 11, "**");
    expect(r.value).toBe("make this bold");
  });

  it("inserts an empty pair with the caret inside", () => {
    const r = wrapSelection("x ", 2, 2, "**");
    expect(r.value).toBe("x ****");
    expect(r.selStart).toBe(4);
  });
});

describe("toggleLinePrefix", () => {
  it("adds a task prefix", () => {
    const r = toggleLinePrefix("write docs", 5, "- [ ] ")!;
    expect(r.value).toBe("- [ ] write docs");
  });

  it("removes an existing identical prefix", () => {
    const r = toggleLinePrefix("- [ ] write docs", 10, "- [ ] ")!;
    expect(r.value).toBe("write docs");
  });
});
