import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, type CheckInDraft, type PrevItem } from "./ai/draft-schema";
import { autoTag, composeDraft, untag } from "./draft";
import { itemKey } from "./note-items";

const roster = [
  { userId: "u_sam", name: "Sam Miller" },
  { userId: "u_lena", name: "Lena Krüger" },
  { userId: "u_samira", name: "Samira Khan" },
];

const prev = (text: string, checked = false): PrevItem => ({ key: itemKey(text), text, checked });
const noTyped = { yesterday: "", today: "", blockers: "" };
const draft = (d: Partial<CheckInDraft>): CheckInDraft => ({ ...EMPTY_DRAFT, ...d });

describe("composeDraft", () => {
  const previous = [prev("Ship the day rail"), prev("Guided check-in"), prev("Old idea")];

  it("marks done, carries not-done forward, and omits dropped items", () => {
    const r = composeDraft(
      { previous, typed: noTyped },
      draft({
        previous: [
          { key: itemKey("Ship the day rail"), status: "done" },
          { key: itemKey("Old idea"), status: "dropped" },
        ],
        yesterday: [{ text: "Paired on the ingest queue" }],
        today: [{ text: "Write release notes" }, { text: "guided check-in" }],
      }),
      roster,
    );
    expect(r.fields.yesterday).toBe("- [x] Ship the day rail\n- [ ] Guided check-in\n- Paired on the ingest queue");
    // Carried item first; the AI's duplicate "guided check-in" is dropped.
    expect(r.fields.today).toBe("- [ ] Guided check-in\n- [ ] Write release notes");
    expect(r.keptTyped).toEqual([]);
  });

  it("lets taps during recording override the model", () => {
    const r = composeDraft(
      { previous, typed: noTyped, hints: { [itemKey("Guided check-in")]: "done" } },
      draft({ previous: [{ key: itemKey("Guided check-in"), status: "not_done" }] }),
      roster,
    );
    expect(r.fields.yesterday).toContain("- [x] Guided check-in");
    expect(r.fields.today).not.toContain("Guided check-in");
  });

  it("keeps sections the author already typed and offers the AI version", () => {
    const r = composeDraft(
      { previous: [], typed: { yesterday: "", today: "- [ ] my own plan", blockers: "" } },
      draft({ today: [{ text: "AI plan" }] }),
      roster,
    );
    expect(r.fields.today).toBe("- [ ] my own plan");
    expect(r.ai.today).toBe("- [ ] AI plan");
    expect(r.keptTyped).toEqual(["today"]);
  });

  it("tags people the AI heard, ignoring ids that aren't on the team", () => {
    const r = composeDraft(
      { previous: [], typed: noTyped },
      draft({
        blockers: [{ text: "Waiting on staging keys from Lena" }],
        mentions: [{ userId: "u_lena" }, { userId: "u_attacker" }],
      }),
      roster,
    );
    expect(r.fields.blockers).toBe("- Waiting on staging keys from [@Lena Krüger](mention:u_lena)");
    expect(r.tagged).toEqual(["u_lena"]);
  });
});

describe("autoTag", () => {
  it("tags full names case-insensitively", () => {
    expect(autoTag("sync with sam miller today", roster).md).toBe("sync with [@Sam Miller](mention:u_sam) today");
  });

  it("tags a unique capitalised first name, keeping possessives", () => {
    expect(autoTag("Review Lena's PR", roster)).toEqual({
      md: "Review [@Lena Krüger](mention:u_lena)'s PR",
      tagged: ["u_lena"],
    });
  });

  it("does not tag lowercase words or partial words", () => {
    expect(autoTag("the lena project and Samsung", roster).tagged).toEqual([]);
  });

  it("skips ambiguous first names unless hinted", () => {
    const team = [...roster, { userId: "u_sam2", name: "Sam Ortiz" }];
    expect(autoTag("ask Sam", team).tagged).toEqual([]);
    expect(autoTag("ask Sam", team, ["u_sam2"]).md).toBe("ask [@Sam Ortiz](mention:u_sam2)");
  });

  it("never rewrites existing mentions or tags someone twice", () => {
    const md = "[@Sam Miller](mention:u_sam) and Sam again";
    expect(autoTag(md, roster)).toEqual({ md, tagged: [] });
  });

  it("prefers the longer name when names overlap", () => {
    expect(autoTag("Samira will pair", roster).md).toBe("[@Samira Khan](mention:u_samira) will pair");
  });
});

describe("untag", () => {
  it("round-trips a tag back to plain text", () => {
    const tagged = autoTag("Review Lena's PR with Sam Miller", roster).md;
    expect(untag(untag(tagged, "u_lena"), "u_sam")).toBe("Review Lena Krüger's PR with Sam Miller");
  });
});
