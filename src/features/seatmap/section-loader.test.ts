import { describe, expect, it } from "vitest";
import type { Point } from "@/domain/venue/types";
import {
  LOAD_FROM_ZOOM,
  sectionsToLoad,
  type LoaderView,
} from "./section-loader";

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

const view = (
  zoom: number,
  minX: number,
  maxX: number,
  extra: Partial<LoaderView> = {},
): LoaderView => ({
  zoom,
  bounds: [
    [minX, -1],
    [maxX, 2],
  ],
  center: [(minX + maxX) / 2, 0.5],
  pitch: 0,
  moving: false,
  ...extra,
});

const none: ReadonlySet<string> = new Set();
const near = view(LOAD_FROM_ZOOM, 1, 5);

describe("sectionsToLoad", () => {
  it("loads nothing for the whole-venue view", () => {
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM - 0.5, 0, 25), sections, none, []),
    ).toEqual([]);
  });

  it("loads the sections in view (plus a margin), nearest to the centre first", () => {
    // view x 1..5 (rộng 4, nới 25% = 1 mỗi bên → 0..6): a, b, c; far/farther ngoài
    expect(sectionsToLoad(near, sections, none, [])).toEqual(["b", "c", "a"]);
  });

  it("orders by the camera centre, not the middle of the view box", () => {
    // map nghiêng: khung nhìn kéo dài về phía chân trời, camera vẫn nhìn vào a
    const tilted = view(LOAD_FROM_ZOOM, 0, 5, { center: [0.5, 0.5] });
    expect(sectionsToLoad(tilted, sections, none, [])).toEqual(["a", "b", "c"]);
  });

  it("drops the margin when the map is steeply tilted", () => {
    // x 5.5..9.5: không nghiêng thì nới tới 4.5..10.5 (c, far); nghiêng thì không section nào
    expect(
      sectionsToLoad(view(LOAD_FROM_ZOOM, 5.5, 9.5), sections, none, []),
    ).toEqual(["c", "far"]);
    expect(
      sectionsToLoad(
        view(LOAD_FROM_ZOOM, 5.5, 9.5, { pitch: 45 }),
        sections,
        none,
        [],
      ),
    ).toEqual([]);
  });

  it("loads only pinned sections while the camera is moving", () => {
    const flying = view(LOAD_FROM_ZOOM, 1, 5, { moving: true });
    expect(sectionsToLoad(flying, sections, none, ["far"])).toEqual(["far"]);
  });

  it("skips sections already loaded or loading", () => {
    expect(sectionsToLoad(near, sections, new Set(["b"]), [])).toEqual([
      "c",
      "a",
    ]);
  });

  it("always loads pinned sections first, at any zoom", () => {
    expect(
      sectionsToLoad(near, sections, none, ["farther", null, "b"]),
    ).toEqual(["farther", "b", "c", "a"]);
    expect(
      sectionsToLoad(view(2, 0, 25), sections, new Set(["far"]), [
        "far",
        "farther",
        "unknown",
      ]),
    ).toEqual(["farther"]);
  });

  it("loads the hovered section only once zoomed in", () => {
    // hover lướt qua map toàn sân không được kéo chunk về
    expect(sectionsToLoad(view(2, 0, 25), sections, none, [], "far")).toEqual(
      [],
    );
    expect(sectionsToLoad(near, sections, none, [], "far")).toEqual([
      "far",
      "b",
      "c",
      "a",
    ]);
  });
});
