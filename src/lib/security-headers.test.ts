import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { buildCsp } from "./csp";

describe("security headers", () => {
  it("applies the baseline set to every path", async () => {
    const groups = await nextConfig.headers!();
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.source).toBe("/:path*");

    const keys = group.headers.map((h) => h.key);
    for (const required of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(keys).toContain(required);
    }
  });
});

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );

describe("content security policy", () => {
  const prod = directives(
    buildCsp("abc123", { dev: false, s3Endpoint: "https://bucket.example.com/path", appUrl: "https://app.example.com" }),
  );

  it("runs only nonce-marked scripts in production", () => {
    expect(prod["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("loads images and media only from the app and the bucket", () => {
    expect(prod["img-src"]).toEqual(["'self'", "data:", "blob:", "https://bucket.example.com"]);
    expect(prod["media-src"]).toEqual(["'self'", "blob:", "https://bucket.example.com"]);
    expect(prod["connect-src"]).toEqual(["'self'", "https://bucket.example.com"]);
  });

  it("locks down framing, plugins, base and forms", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
  });

  it("upgrades insecure requests when the app is served over https, regardless of the bucket", () => {
    expect("upgrade-insecure-requests" in prod).toBe(true);
    const httpBucket = directives(buildCsp("n", { dev: false, s3Endpoint: "http://minio:9000", appUrl: "https://app.example.com" }));
    expect("upgrade-insecure-requests" in httpBucket).toBe(true);
    const httpApp = directives(buildCsp("n", { dev: false, s3Endpoint: "http://localhost:9000", appUrl: "http://localhost:3000" }));
    expect("upgrade-insecure-requests" in httpApp).toBe(false);
  });

  it("only allows eval in development", () => {
    expect(directives(buildCsp("n", { dev: true }))["script-src"]).toContain("'unsafe-eval'");
  });
});
