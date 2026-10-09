import { describe, expect, it } from "vitest";
import { bearingToward } from "./camera";
import {
  convexHull,
  medianSeatSpacing,
  outlineRing,
  uprightAngle,
} from "./venue-shape";

const seat = (row: string, n: number, x: number, y = 0) => ({
  type: "Feature" as const,
  properties: { section: "101", row, seat: n },
  geometry: { type: "Point", coordinates: [x, y] },
});

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

describe("medianSeatSpacing", () => {
  it("measures the distance between neighbouring seats in a row", () => {
    // thứ tự lộn xộn, 1 row khoảng 0.5, 1 row khoảng 0.5 và 1 khe lối đi 2
    const seats = {
      type: "FeatureCollection" as const,
      features: [
        seat("A", 2, 0.5),
        seat("A", 1, 0),
        seat("A", 3, 1),
        seat("B", 1, 0, 1),
        seat("B", 2, 0.5, 1),
        seat("B", 3, 2.5, 1),
      ],
    };
    expect(medianSeatSpacing(seats)).toBe(0.5);
  });

  it("uses the row gap when rows are closer than seats", () => {
    const seats = {
      type: "FeatureCollection" as const,
      features: [0, 1, 2].flatMap((x) => [
        seat("A", x + 1, x),
        seat("B", x + 1, x, 0.3),
      ]),
    };
    expect(medianSeatSpacing(seats)).toBeCloseTo(0.3);
  });

  it("stays fast on a stadium-sized section (40,000 seats)", () => {
    const seats = {
      type: "FeatureCollection" as const,
      features: Array.from({ length: 200 * 200 }, (_, i) =>
        seat(
          String(Math.floor(i / 200)),
          (i % 200) + 1,
          (i % 200) * 0.1,
          Math.floor(i / 200) * 0.2,
        ),
      ),
    };
    const started = performance.now();
    expect(medianSeatSpacing(seats)).toBeCloseTo(0.1);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("is 0 without seats", () => {
    expect(medianSeatSpacing({ type: "FeatureCollection", features: [] })).toBe(
      0,
    );
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
