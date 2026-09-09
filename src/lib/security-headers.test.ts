import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers", () => {
  it("applies the baseline set to every path", async () => {
    const groups = await nextConfig.headers!();
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.source).toBe("/:path*");

    const keys = group.headers.map((h) => h.key);
    for (const required of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(keys).toContain(required);
    }

    const csp = group.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
  });
});
