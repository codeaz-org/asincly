import { beforeAll, describe, expect, it } from "vitest";
import { emailKindFor, unsubscribeUrl, verifyUnsubscribe } from "./email-prefs";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("unsubscribe links", () => {
  it("verify for the user and stream they were made for, and nothing else", () => {
    const q = new URL(unsubscribeUrl("u1", "reminders")).searchParams;
    expect(verifyUnsubscribe("u1", "reminders", q.get("s")!)).toBe(true);
    expect(verifyUnsubscribe("u2", "reminders", q.get("s")!)).toBe(false);
    expect(verifyUnsubscribe("u1", "activity", q.get("s")!)).toBe(false);
    expect(verifyUnsubscribe("u1", "everything", q.get("s")!)).toBe(false);
    expect(verifyUnsubscribe("u1", "reminders", "nope")).toBe(false);
  });

  it("files reminders apart from everything else", () => {
    expect(emailKindFor("window_open")).toBe("reminders");
    expect(emailKindFor("mentioned")).toBe("activity");
    expect(emailKindFor("nudged")).toBe("activity");
  });
});
