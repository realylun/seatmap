import { describe, expect, it } from "vitest";
import {
  applyPick,
  dominantColors,
  fullySelected,
  indexSeats,
  levelForZoom,
  targetSids,
} from "./assign-selection";

const sids = ["A|1|1", "A|1|2", "A|2|1", "B|1|1"];
const index = indexSeats(sids);
const COLORS: Record<string, string> = {
  "A|1|1": "#f00",
  "A|1|2": "#f00",
  "A|2|1": "#0f0",
};

describe("levelForZoom", () => {
  it("switches at 5 and 6.2", () => {
    expect(levelForZoom(4.9)).toBe("section");
    expect(levelForZoom(5)).toBe("row");
    expect(levelForZoom(6.19)).toBe("row");
    expect(levelForZoom(6.2)).toBe("seat");
  });
});

describe("targetSids", () => {
  it("resolves section, row and seat picks", () => {
    expect(targetSids(index, { level: "section", section: "A" })).toEqual(
      sids.slice(0, 3),
    );
    expect(targetSids(index, { level: "row", section: "A", row: "1" })).toEqual(
      ["A|1|1", "A|1|2"],
    );
    expect(targetSids(index, { level: "seat", sid: "B|1|1" })).toEqual([
      "B|1|1",
    ]);
    expect(targetSids(index, { level: "section", section: "Z" })).toEqual([]);
  });
});

describe("applyPick", () => {
  it("replaces without shift and does not mutate", () => {
    const before = new Set(["B|1|1"]);
    const after = applyPick(before, ["A|1|1"], false);
    expect([...after]).toEqual(["A|1|1"]);
    expect([...before]).toEqual(["B|1|1"]);
  });

  it("adds with shift, and removes when target already fully selected", () => {
    const added = applyPick(new Set(["B|1|1"]), ["A|1|1", "A|1|2"], true);
    expect(added.size).toBe(3);
    const removed = applyPick(added, ["A|1|1", "A|1|2"], true);
    expect([...removed]).toEqual(["B|1|1"]);
  });

  it("keeps selection for an empty target", () => {
    const s = new Set(["A|1|1"]);
    expect(applyPick(s, [], false)).toBe(s);
  });
});

describe("fullySelected / dominantColors", () => {
  it("reports only fully selected groups", () => {
    const sel = new Set(["A|1|1", "A|1|2", "A|2|1"]);
    expect(fullySelected(index.bySection, sel)).toEqual(["A"]);
    expect(fullySelected(index.byRow, new Set(["A|1|1"]))).toEqual([]);
  });

  it("picks the majority color and skips untiered groups", () => {
    const out = dominantColors(index.bySection, (sid) => COLORS[sid] ?? null);
    expect(out.get("A")).toBe("#f00");
    expect(out.has("B")).toBe(false);
  });
});
