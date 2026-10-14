import { describe, expect, it } from "vitest";
import { deleteObjects, presignedPutUrl } from "./s3";

// Requires local MinIO up (pnpm db:up).

describe("presigned upload", () => {
  it("accepts exactly the size that was signed, and nothing larger", async () => {
    const key = `check-ins/${crypto.randomUUID()}/${crypto.randomUUID()}.webm`;
    const url = await presignedPutUrl(key, "video/webm", 4);
    const put = (body: string) => fetch(url, { method: "PUT", headers: { "content-type": "video/webm" }, body });

    expect((await put("x".repeat(64))).ok).toBe(false);
    expect((await put("xxxx")).ok).toBe(true);
    await deleteObjects([key]);
  });
});
