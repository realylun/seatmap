import { describe, expect, it } from "vitest";
import type { Point } from "@/domain/venue/types";
import { LOAD_FROM_ZOOM, sectionsToLoad } from "./section-loader";

const box = (x: number, y: number): [Point, Point] => [
  [x, y],
  [x + 1, y + 1],
];

// lưới 5 section trên trục x: 0, 2, 4, 10, 20
const sections = [
  { id: "a", bounds: box(0, 0) },
  { id: "b", bounds: box(2, 0) },
  { id: "c", bounds: box(4, 0) },
  { id: "far", bounds: box(10, 0) },
  { id: "farther", bounds: box(20, 0) },
];

const view = (zoom: number, minX: number, maxX: number) => ({
  zoom,
  bounds: [
    [minX, -1],
    [maxX, 2],
  ] as [Point, Point],
});

const none: ReadonlySet<string> = new Set();

describe("sectionsToLoad", () => {
  it("loads nothing for the whole-venue view", () => {
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM - 0.5, 0, 25), sections, none, []),
    ).toEqual([]);
  });

  it("loads the sections in view (plus a margin), nearest to the centre first", () => {
    // view x 1..5 (rộng 4, nới 25% = 1 mỗi bên → 0..6): a, b, c; far/farther ngoài
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM, 1, 5), sections, none, []),
    ).toEqual(["b", "c", "a"]);
  });

  it("skips sections already loaded or loading", () => {
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM, 1, 5), sections, new Set(["b"]), []),
    ).toEqual(["c", "a"]);
  });

  it("always loads pinned sections first, at any zoom", () => {
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM, 1, 5), sections, none, [
        "farther",
        null,
        "b",
      ]),
    ).toEqual(["farther", "b", "c", "a"]);
    expect(
      sectionsToLoad(view(2, 0, 25), sections, new Set(["far"]), [
        "far",
        "farther",
        "unknown",
      ]),
    ).toEqual(["farther"]);
  });
});
