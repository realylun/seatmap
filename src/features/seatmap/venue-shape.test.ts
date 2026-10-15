import { describe, expect, it } from "vitest";
import { bearingToward } from "./camera";
import { convexHull, outlineRing, uprightAngle } from "./venue-shape";

describe("convexHull", () => {
  it("drops interior points and returns a closed counter-clockwise ring", () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
      [1, 0.5],
    ]);
    expect(hull).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ]);
  });

  it("returns empty for fewer than 3 points", () => {
    expect(convexHull([[0, 0]])).toEqual([]);
  });
});

describe("outlineRing", () => {
  it("expands the hull of all sections away from its center", () => {
    const ring = outlineRing(
      [
        [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      0.5,
    );
    expect(ring[0]).toEqual([-1, -0.5]);
    expect(ring[2]).toEqual([5, 2.5]);
    expect(ring.at(-1)).toEqual(ring[0]);
  });
});

describe("bearingToward", () => {
  it("rotates so the focus point sits at the top of the screen", () => {
    expect(bearingToward([0, -1], [0, 0])).toBe(0);
    expect(bearingToward([0, 1], [0, 0])).toBe(180);
    expect(bearingToward([-1, 0], [0, 0])).toBe(90);
    expect(bearingToward([0, 0], [0, 0])).toBe(0);
  });
});

describe("uprightAngle", () => {
  it("keeps strip labels readable whatever the map bearing", () => {
    expect(uprightAngle(30, 0)).toBe(30);
    expect(uprightAngle(30, 180)).toBe(30);
    expect(uprightAngle(30, 90)).toBe(-60);
    expect(uprightAngle(-80, 30)).toBe(70);
  });
});
