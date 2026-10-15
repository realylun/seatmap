import { describe, expect, it } from "vitest";
import { medianSeatSpacing } from "./seat-spacing";

const seat = (row: string, n: number, x: number, y = 0) => ({
  type: "Feature" as const,
  properties: { section: "101", row, seat: n },
  geometry: { type: "Point", coordinates: [x, y] },
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

  // Không so wall-clock (chập chờn khi chạy song song); timeout 10s đủ bắt bản O(n²) cũ (~36s)
  it(
    "stays fast on a stadium-sized section (40,000 seats)",
    { timeout: 10_000 },
    () => {
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
      expect(medianSeatSpacing(seats)).toBeCloseTo(0.1);
    },
  );

  it("is 0 without seats", () => {
    expect(medianSeatSpacing({ features: [] })).toBe(0);
  });
});
