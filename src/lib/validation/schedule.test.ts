import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MIN_WINDOW_MINUTES, windowMinutes } from "@/lib/time";
import { hhmm, withWindowLength } from "./schedule";

const Schema = withWindowLength(z.object({ windowOpen: hhmm, windowClose: hhmm }));
const check = (windowOpen: string, windowClose: string) =>
  Schema.safeParse({ windowOpen, windowClose }).success;

describe("windowMinutes", () => {
  it("measures a same-day window", () => {
    expect(windowMinutes("09:00", "11:00")).toBe(120);
    expect(windowMinutes("09:00", "09:30")).toBe(30);
  });

  it("wraps past midnight, like windowFor", () => {
    expect(windowMinutes("22:00", "02:00")).toBe(240);
    expect(windowMinutes("23:30", "00:15")).toBe(45);
  });

  it("treats equal open and close as a full day, not zero", () => {
    expect(windowMinutes("09:00", "09:00")).toBe(1440);
  });

  it("accepts the HH:MM:SS the database column returns", () => {
    expect(windowMinutes("09:00:00", "11:00:00")).toBe(120);
  });
});

describe("window length validation", () => {
  it("accepts the product default", () => {
    expect(check("09:00", "11:00")).toBe(true);
  });

  it("accepts exactly the minimum", () => {
    expect(check("09:00", "09:30")).toBe(true);
    expect(windowMinutes("09:00", "09:30")).toBe(MIN_WINDOW_MINUTES);
  });

  // The reason the rule exists: a window this short can open and close
  // between two ticks, so nobody is ever reminded.
  it("rejects a window shorter than the tick interval", () => {
    expect(check("09:00", "09:05")).toBe(false);
    expect(check("09:00", "09:29")).toBe(false);
  });

  it("accepts a window that wraps midnight", () => {
    expect(check("22:00", "02:00")).toBe(true);
  });

  it("rejects a short wrapping window", () => {
    expect(check("23:50", "00:10")).toBe(false);
  });

  it("reports the problem against windowClose", () => {
    const res = Schema.safeParse({ windowOpen: "09:00", windowClose: "09:05" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].path).toEqual(["windowClose"]);
      expect(res.error.issues[0].message).toMatch(/at least 30 minutes/i);
    }
  });

  it("still rejects a malformed time", () => {
    expect(check("9:00", "11:00")).toBe(false);
    expect(check("09:00", "notatime")).toBe(false);
  });
});
