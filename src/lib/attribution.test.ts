import { describe, expect, it } from "vitest";
import { attributionQuery, parseAttribution } from "./attribution";

describe("parseAttribution", () => {
  it("needs a source", () => {
    expect(parseAttribution({ utm_medium: "social" })).toBeNull();
    expect(parseAttribution(new URLSearchParams(""))).toBeNull();
  });

  it("keeps only the campaign labels, cleaned", () => {
    const attr = parseAttribution(
      new URLSearchParams("utm_source=LinkedIn&utm_medium=social&utm_campaign=Asincly W2!&gclid=abc&email=a@b.c"),
    );
    expect(attr).toEqual({ source: "linkedin", medium: "social", campaign: "asincly-w2" });
  });

  it("reads plain objects, arrays and form data", () => {
    expect(parseAttribution({ utm_source: ["hn", "x"] })).toEqual({ source: "hn" });
    const fd = new FormData();
    fd.set("utm_source", "guide");
    fd.set("utm_content", "geekbot-alternative");
    expect(parseAttribution(fd)).toEqual({ source: "guide", content: "geekbot-alternative" });
  });

  it("caps length and strips unsafe characters", () => {
    const attr = parseAttribution({ utm_source: `<script>${"a".repeat(100)}` });
    expect(attr?.source).toMatch(/^script-a+$/);
    expect(attr?.source.length).toBe(64);
  });
});

describe("attributionQuery", () => {
  it("round-trips", () => {
    const attr = { source: "reddit", medium: "community", campaign: "asincly-w3" };
    expect(parseAttribution(new URLSearchParams(attributionQuery(attr).slice(1)))).toEqual(attr);
    expect(attributionQuery(null)).toBe("");
  });
});
