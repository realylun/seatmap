import { describe, expect, it } from "vitest";
import { buildListings } from "@/domain/seats/listings";
import { buildVenue } from "@/domain/venue/venue-file";
import type { SectionConfig } from "@/domain/venue/types";
import { decodeAvailability, isSelectable } from "./availability";
import { buildStyle, PROMOTE, SEAT_LEVEL, SWITCH_LEVEL } from "./build-style";
import { boundsCenter, ringBounds } from "./camera";
import {
  diffStates,
  rowStates,
  seatStates,
  sectionStates,
} from "./feature-states";
import { labelFeatures, labelRotation } from "./labels";
import { parseMapVenue, toMapVenue } from "./map-venue";
import {
  colorKey,
  formatPriceShort,
  rowMarkers,
  sectionMarkers,
  sectionShape,
} from "./markers";
import { MAX_SELECTION, selectionReducer, selectionTotal } from "./selection";

const section = (id: string, x: number): SectionConfig => ({
  id,
  ring: [
    [x, 0],
    [x + 4, 0],
    [x + 4, 2],
    [x, 2],
    [x, 0],
  ],
  frontEdge: 0,
  rowStart: "A",
  rowCount: 2,
  rowSkip: [],
  seatsPerRow: 3,
  overrides: "",
  seatSpacing: 0.5,
  numbering: "ltr",
});

const venue = buildVenue({
  extent: { w: 20, h: 10 },
  sections: [section("101", 0), section("102", 6)],
});

const tiers = [
  { id: "t1", name: "Cat 1", price: 500_000, color: "#E4572E" },
  { id: "t2", name: "Cat 2", price: 1_200_000, color: "#1E7A1E" },
];

describe("map venue", () => {
  it("adds rid / sid for promoteId and row centers", () => {
    const mv = toMapVenue(venue);
    expect(mv.sections.map((s) => s.id)).toEqual(["101", "102"]);
    expect(mv.sections[0].rows).toHaveLength(2);
    const seat = mv.geojson.seats.features[0].properties;
    expect(seat.sid).toBe([seat.section, seat.row, seat.seat].join("|"));
    const row = mv.geojson.rows.features[0].properties;
    expect(row.rid).toBe([row.section, row.row].join("|"));
    expect(mv.geojson.seats.features).toHaveLength(12);
  });

  it("rejects invalid geometry", () => {
    expect(() => parseMapVenue({ version: 2 })).toThrow(/invalid/);
    expect(parseMapVenue(venue).sections).toHaveLength(2);
  });
});

describe("buildStyle", () => {
  const style = buildStyle(toMapVenue(venue), {
    glyphs: "/fonts/{fontstack}/{range}.pbf",
  });
  const layer = (id: string) => style.layers.find((l) => l.id === id);

  it("promotes ids and declares dynamic sources", () => {
    expect(style.sources.seats).toMatchObject({
      type: "geojson",
      promoteId: PROMOTE.seats,
    });
    expect(style.sources.rows).toMatchObject({ promoteId: "rid" });
    for (const id of [
      "section-markers",
      "row-markers",
      "hovered-section",
      "selected-section",
      "labels",
    ]) {
      expect(style.sources[id]).toMatchObject({ type: "geojson" });
    }
    expect(style.glyphs).toContain("{fontstack}");
  });

  it("switches pins at SWITCH_LEVEL and draws seats from SEAT_LEVEL", () => {
    expect(layer("section-markers")).toMatchObject({ maxzoom: SWITCH_LEVEL });
    expect(layer("row-markers")).toMatchObject({ minzoom: SWITCH_LEVEL });
    expect(layer("row-markers")).not.toHaveProperty("maxzoom");
    expect(layer("seats")).toMatchObject({ minzoom: SEAT_LEVEL - 0.4 });
    const ids = style.layers.map((l) => l.id);
    expect(ids.indexOf("seats")).toBeLessThan(ids.indexOf("section-markers"));
  });
});

describe("stage (geojson.field)", () => {
  const stage = buildVenue({
    extent: { w: 20, h: 10 },
    sections: [section("101", 0)],
    objects: [
      {
        kind: "stage",
        ring: [
          [0, 4],
          [4, 4],
          [4, 6],
          [0, 6],
          [0, 4],
        ],
      },
    ],
  });
  const mv = parseMapVenue(JSON.parse(JSON.stringify(stage)) as unknown);
  const style = buildStyle(mv, { glyphs: "/fonts/{fontstack}/{range}.pbf" });
  const ids = style.layers.map((l) => l.id);

  it("keeps field polygons from venue.json", () => {
    expect(mv.geojson.field.features).toHaveLength(1);
    expect(mv.geojson.field.features[0].properties).toEqual({ kind: "stage" });
  });

  it("draws stage dark grey above the outline, below sections / seats / pills", () => {
    expect(style.sources.field).toMatchObject({ data: mv.geojson.field });
    const fill = style.layers.find((l) => l.id === "field");
    expect(JSON.stringify(fill)).toContain("#4d4d4d");
    for (const id of ["field", "field-stroke"]) {
      expect(ids.indexOf(id)).toBeGreaterThan(ids.indexOf("outline-stroke"));
      expect(ids.indexOf(id)).toBeLessThan(ids.indexOf("section-fill"));
    }
    expect(ids.indexOf("section-fill")).toBeLessThan(ids.indexOf("seats"));
    expect(ids.indexOf("seats")).toBeLessThan(ids.indexOf("section-labels"));
  });
});

describe("labels", () => {
  it("keeps compact sections upright and rotates long strips", () => {
    expect(labelRotation(section("a", 0).ring)).toBe(0);
    const strip: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 1],
      [0, 1],
      [0, 0],
    ];
    expect(labelRotation(strip)).toBeCloseTo(0);
    const diagonal: [number, number][] = [
      [0, 0],
      [10, 10],
      [9, 11],
      [-1, 1],
      [0, 0],
    ];
    expect(Math.abs(labelRotation(diagonal))).toBeCloseTo(45);
    const fc = labelFeatures(toMapVenue(venue).sections);
    expect(fc.features.map((f) => f.properties.label)).toEqual(["101", "102"]);
  });
});

describe("availability decoding", () => {
  const payload = {
    tiers,
    seats: [
      ["101|A|1", 0, 0],
      ["101|A|2", 0, 1],
      ["101|A|3", -1, 0],
      ["102|B|1", 1, 2],
    ],
  };

  it("maps tier index and status code", () => {
    const d = decodeAvailability(payload);
    expect(d.seats[0]).toEqual({
      sid: "101|A|1",
      tierId: "t1",
      price: 500_000,
      status: "available",
    });
    expect(d.seats[1].status).toBe("held");
    expect(d.seats[2]).toMatchObject({ tierId: null, price: null });
    expect(d.seats[3]).toMatchObject({ tierId: "t2", status: "sold" });
    expect(d.tierBySid.get("102|B|1")?.color).toBe("#1E7A1E");
    expect(d.tierBySid.has("101|A|3")).toBe(false);
  });

  it("only available tiered seats are selectable", () => {
    const d = decodeAvailability(payload);
    expect(d.seats.map(isSelectable)).toEqual([true, false, false, false]);
    expect(isSelectable(undefined)).toBe(false);
  });

  it("rejects malformed payloads", () => {
    expect(() =>
      decodeAvailability({ tiers: [], seats: [["x", 0, 9]] }),
    ).toThrow();
    expect(() => decodeAvailability(null)).toThrow();
  });
});

const colorOf = (id: string) => tiers.find((t) => t.id === id)?.color ?? "#000";

describe("markers and feature states", () => {
  const sections = new Map(toMapVenue(venue).sections.map((s) => [s.id, s]));
  const listings = [
    { section: "101", row: "A", price: 500_000, tierId: "t1" },
    { section: "101", row: "B", price: 1_200_000, tierId: "t2" },
    { section: "102", row: "A", price: 1_200_000, tierId: "t2" },
    { section: "999", row: "A", price: 1, tierId: "t1" },
  ];

  it("formats compact ASCII prices and color keys", () => {
    expect(formatPriceShort(850_000)).toBe("850K");
    expect(formatPriceShort(1_250_000)).toBe("1.3M");
    expect(formatPriceShort(2_000_000)).toBe("2M");
    expect(formatPriceShort(500)).toBe("500");
    expect(colorKey("#E4572E")).toBe("e4572e");
  });

  it("builds one cheapest pin per section and per row, skipping unknown sections", () => {
    const bySection = sectionMarkers(listings, sections, colorOf).features;
    expect(
      bySection.map((f) => [f.properties.section, f.properties.label]),
    ).toEqual([
      ["101", "500K"],
      ["102", "1.2M"],
    ]);
    expect(bySection[0].properties.colorKey).toBe("e4572e");
    expect(rowMarkers(listings, sections, colorOf).features).toHaveLength(3);
    expect(sectionShape(sections.get("101")).features).toHaveLength(1);
    expect(sectionShape(undefined).features).toHaveLength(0);
  });

  it("derives seat/row/section states and diffs them", () => {
    const d = decodeAvailability({
      tiers,
      seats: [
        ["101|A|1", 0, 0],
        ["101|A|2", -1, 3],
      ],
    });
    const seats = seatStates(d.seats, d.tierBySid);
    expect(seats.get("101|A|1")).toEqual({ color: "#E4572E", status: 0 });
    expect(seats.get("101|A|2")).toEqual({ color: null, status: 3 });
    expect(rowStates(listings, colorOf).get("101|A")).toEqual({
      color: "#E4572E",
    });
    expect(sectionStates(listings).get("102")).toEqual({ listed: true });

    const next = new Map([
      ["101|A|1", { color: "#E4572E", status: 1 }],
      ["101|A|3", { color: null, status: 0 }],
    ]);
    const diff = diffStates(seats, next);
    expect(diff.set.map(([id]) => id)).toEqual(["101|A|1", "101|A|3"]);
    expect(diff.remove).toEqual(["101|A|2"]);
    expect(diffStates(next, next)).toEqual({ set: [], remove: [] });
  });
});

describe("selection reducer", () => {
  it("toggles, caps at MAX_SELECTION, replaces, clears, prunes", () => {
    let s = selectionReducer([], { type: "toggle", sid: "a" });
    s = selectionReducer(s, { type: "toggle", sid: "b" });
    expect(s).toEqual(["a", "b"]);
    expect(selectionReducer(s, { type: "toggle", sid: "a" })).toEqual(["b"]);
    const full = Array.from({ length: MAX_SELECTION }, (_, i) => `s${i}`);
    expect(selectionReducer(full, { type: "toggle", sid: "x" })).toBe(full);
    expect(
      selectionReducer(s, { type: "replace", sids: ["c", "c", "d"] }),
    ).toEqual(["c", "d"]);
    expect(selectionReducer(s, { type: "clear" })).toEqual([]);
    const empty: string[] = [];
    expect(selectionReducer(empty, { type: "clear" })).toBe(empty);
    expect(
      selectionReducer(s, {
        type: "prune",
        isSelectable: (sid) => sid === "b",
      }),
    ).toEqual(["b"]);
    expect(
      selectionReducer(s, { type: "prune", isSelectable: () => true }),
    ).toBe(s);
  });

  it("sums known prices", () => {
    const prices: Record<string, number> = { a: 100, b: 250 };
    expect(selectionTotal(["a", "b", "z"], (sid) => prices[sid] ?? null)).toBe(
      350,
    );
  });

  it("works with listings picked from availability", () => {
    const d = decodeAvailability({
      tiers,
      seats: [
        ["101|A|1", 0, 0],
        ["101|A|2", 0, 0],
        ["101|A|4", 0, 0],
      ],
    });
    const [listing] = buildListings(d.seats, { quantity: 2 });
    expect(listing.maxRun).toBe(2);
  });
});

describe("camera helpers", () => {
  it("computes centers and bounds", () => {
    expect(
      boundsCenter([
        [-2, -4],
        [2, 4],
      ]),
    ).toEqual([0, 0]);
    expect(ringBounds(section("a", 1).ring)).toEqual([
      [1, 0],
      [5, 2],
    ]);
  });
});
