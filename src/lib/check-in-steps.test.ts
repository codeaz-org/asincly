import { describe, expect, it } from "vitest";
import {
  STEPS,
  canSend,
  hasContent,
  initialStep,
  nextStep,
  parseStep,
  prevStep,
  stepProgress,
} from "./check-in-steps";

const empty = { yesterday: "", today: "", blockers: "", hasRecording: false };

describe("navigation", () => {
  it("walks the steps in order", () => {
    expect(STEPS).toEqual(["video", "yesterday", "today", "blockers", "review"]);
    expect(nextStep("video")).toBe("yesterday");
    expect(nextStep("blockers")).toBe("review");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("video")).toBeNull();
    expect(prevStep("yesterday")).toBe("video");
  });

  it("parses unknown values to the fallback", () => {
    expect(parseStep("today")).toBe("today");
    expect(parseStep("nope")).toBe("yesterday");
    expect(parseStep(null, "video")).toBe("video");
    expect(parseStep(undefined, "review")).toBe("review");
  });

  it("reports progress from 0 to 1", () => {
    expect(stepProgress("video")).toBe(0);
    expect(stepProgress("today")).toBe(0.5);
    expect(stepProgress("review")).toBe(1);
  });
});

describe("canSend", () => {
  it("needs some content or a recording", () => {
    expect(canSend(empty)).toBe(false);
    expect(canSend({ ...empty, today: "  " })).toBe(false);
    expect(canSend({ ...empty, blockers: "keys" })).toBe(true);
    expect(canSend({ ...empty, hasRecording: true })).toBe(true);
  });

  it("needs a video or a skip reason when the team requires video", () => {
    const text = { ...empty, today: "- [ ] ship" };
    expect(canSend({ ...text, requireVideo: true })).toBe(false);
    expect(canSend({ ...text, requireVideo: true, hasSkipReason: true })).toBe(true);
    expect(canSend({ ...empty, requireVideo: true, hasRecording: true })).toBe(true);
    expect(canSend({ ...empty, requireVideo: true, hasSkipReason: true })).toBe(false);
  });

  it("ignores bare list markers", () => {
    expect(hasContent("- ")).toBe(false);
    expect(hasContent("- [ ] \n-\n1. ")).toBe(false);
    expect(hasContent("- [ ] ship it")).toBe(true);
    expect(canSend({ ...empty, today: "- [ ] " })).toBe(false);
  });
});

describe("initialStep", () => {
  it("opens sent check-ins and drafts with a video on review", () => {
    expect(initialStep({ ...empty, today: "x" }, "submitted")).toBe("review");
    expect(initialStep({ ...empty, hasRecording: true }, "draft")).toBe("review");
  });
  it("resumes drafts at the first empty step", () => {
    expect(initialStep(empty, "draft")).toBe("yesterday");
    expect(initialStep({ ...empty, yesterday: "x" }, "draft")).toBe("today");
    expect(initialStep({ ...empty, yesterday: "x", today: "y" }, "draft")).toBe("blockers");
  });
  it("starts fresh drafts by recording", () => {
    expect(initialStep({ ...empty, yesterday: "x", today: "- [ ] y" }, "draft", false)).toBe("video");
  });
});
