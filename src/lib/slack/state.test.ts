import { describe, expect, it } from "vitest";
import { createState, readState } from "./state";

const secret = "test-secret";
const teamId = "7b0c1a52-3f7e-4d8e-9a0b-2c1d3e4f5a6b";

describe("Slack install state", () => {
  it("round-trips within ten minutes", () => {
    const now = Date.now();
    const state = createState(teamId, "user-1", secret, now);
    expect(readState(state, secret, now + 60_000)).toMatchObject({ teamId, userId: "user-1" });
    expect(readState(state, secret, now + 11 * 60_000)).toBeNull();
  });

  it("rejects tampering and other secrets", () => {
    const state = createState(teamId, "user-1", secret);
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ teamId, userId: "attacker", exp: Date.now() + 60_000 })).toString("base64url");
    expect(readState(`${forged}.${sig}`, secret)).toBeNull();
    expect(readState(`${payload}.${sig}`, "other")).toBeNull();
    expect(readState("garbage", secret)).toBeNull();
  });
});
