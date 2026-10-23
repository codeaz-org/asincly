import { describe, expect, it } from "vitest";
import { getGuide, parseGuide } from "./guides";

describe("parseGuide", () => {
  it("reads the header and body", () => {
    const g = parseGuide("a", "---\ntitle: Hello\ndescription: \"One line\"\ndate: 2026-10-27\n---\n\n# Body\n");
    expect(g).toEqual({ slug: "a", title: "Hello", description: "One line", date: "2026-10-27", body: "# Body" });
  });

  it("rejects files without the required fields", () => {
    expect(parseGuide("a", "# no header")).toBeNull();
    expect(parseGuide("a", "---\ntitle: x\ndate: 2026-10-27\n---\nbody")).toBeNull();
    expect(parseGuide("a", "---\ntitle: x\ndescription: y\ndate: soon\n---\nbody")).toBeNull();
  });
});

describe("getGuide", () => {
  it("refuses slugs that could leave the folder", async () => {
    expect(await getGuide("../package")).toBeNull();
    expect(await getGuide("README")).toBeNull();
  });
});
