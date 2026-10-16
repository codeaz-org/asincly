import { describe, expect, it } from "vitest";
import { renderEmail } from "./email";

describe("renderEmail", () => {
  it("escapes everything a teammate can type", () => {
    const html = renderEmail({
      heading: `<script>alert(1)</script> mentioned you`,
      text: `In "Ops" & <b>friends</b>`,
      action: { label: "Open", url: `https://x.test/c/1?a=1&b="2"` },
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>friends");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(`href="https://x.test/c/1?a=1&amp;b=&quot;2&quot;"`);
  });

  it("turns blank lines into paragraphs", () => {
    const html = renderEmail({ heading: "Hi", text: "one\n\ntwo" });
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});
