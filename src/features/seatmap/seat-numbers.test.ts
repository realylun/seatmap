import { describe, expect, it } from "vitest";
import type { GeoFeature } from "./map-venue";
import { selectedSeatNumbers } from "./seat-numbers";

const seat = (sid: string, seatNo: number, x: number): GeoFeature => ({
  type: "Feature",
  properties: { sid, section: "A", row: "1", seat: seatNo },
  geometry: { type: "Point", coordinates: [x, 0] },
});

const index = new Map(
  [seat("A|1|1", 1, 0), seat("A|1|2", 2, 1), seat("A|1|3", 3, 2)].map(
    (f) => [String(f.properties.sid), f] as const,
  ),
);

describe("selectedSeatNumbers", () => {
  it("keeps only selected seats, with their number and position", () => {
    const fc = selectedSeatNumbers(["A|1|3", "A|1|1"], (sid) => index.get(sid));
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([
      {
        type: "Feature",
        properties: { sid: "A|1|3", seat: 3 },
        geometry: { type: "Point", coordinates: [2, 0] },
      },
      {
        type: "Feature",
        properties: { sid: "A|1|1", seat: 1 },
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ]);
  });

  it("skips selected seats whose section has not loaded yet", () => {
    const fc = selectedSeatNumbers(["B|1|1", "A|1|2"], (sid) => index.get(sid));
    expect(fc.features.map((f) => f.properties.sid)).toEqual(["A|1|2"]);
  });

  it("is empty with no selection", () => {
    expect(selectedSeatNumbers([], (sid) => index.get(sid)).features).toEqual(
      [],
    );
  });
});
