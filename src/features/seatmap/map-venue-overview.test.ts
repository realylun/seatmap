import { describe, expect, it } from "vitest";
import { serializeGeometry } from "@/domain/venue/geometry-json";
import { splitVenue } from "@/domain/venue/split";
import type { SectionConfig } from "@/domain/venue/types";
import { buildVenue } from "@/domain/venue/venue-file";
import {
  chunkUrl,
  parseChunk,
  parseOverview,
  toMapVenue,
  type MapSection,
} from "./map-venue";

const section = (id: string, x: number): SectionConfig => ({
  id,
  ring: [
    [x, 0],
    [x + 4, 0],
    [x + 4, 3],
    [x, 3],
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

// toạ độ đã làm tròn như file publish, để so 2 đường tải trên cùng dữ liệu
const venue = buildVenue({
  extent: { w: 20, h: 10 },
  sections: [section("101", 0), section("102", 6)],
  objects: [
    {
      kind: "stage",
      ring: [
        [0, 5],
        [4, 5],
        [4, 7],
        [0, 7],
        [0, 5],
      ],
    },
  ],
});
const { overview, chunks } = splitVenue(venue);
const json = (value: unknown): unknown => JSON.parse(serializeGeometry(value));
const full = toMapVenue(venue);

const withoutChunk = ({ chunk: _chunk, ...rest }: MapSection) => rest;

describe("parseOverview", () => {
  it("draws the same venue as the full file, without seats", () => {
    const mv = parseOverview(json(overview));
    expect(mv.bounds).toEqual(full.bounds);
    expect(mv.focus).toEqual(full.focus);
    expect(mv.seatSpacing).toBe(full.seatSpacing);
    expect(mv.sections.map(withoutChunk)).toEqual(full.sections);
    const { seats, ...geojson } = mv.geojson;
    const { seats: fullSeats, ...fullGeojson } = full.geojson;
    expect(geojson).toEqual(fullGeojson);
    expect(seats.features).toEqual([]);
    expect(fullSeats.features.length).toBeGreaterThan(0);
  });

  it("points each section at its seat chunk", () => {
    const mv = parseOverview(json(overview));
    expect(mv.sections.map((s) => [s.id, s.chunk])).toEqual([
      ["101", "s/0.json"],
      ["102", "s/1.json"],
    ]);
  });

  it("rejects an invalid overview", () => {
    expect(() => parseOverview({ version: 1 })).toThrow(/invalid/);
    expect(() => parseOverview(json(venue))).toThrow(/invalid/);
  });
});

describe("parseChunk", () => {
  it("rebuilds the seats of the full file, sid included", () => {
    const seats = chunks.flatMap((c) => parseChunk(json(c.chunk)).seats);
    expect(seats).toEqual(full.geojson.seats.features);
  });

  it("names the section the chunk belongs to", () => {
    expect(parseChunk(json(chunks[1].chunk)).section).toBe("102");
  });

  it("rejects an invalid chunk", () => {
    expect(() => parseChunk({ version: 1, section: "101" })).toThrow(/invalid/);
  });
});

describe("chunkUrl", () => {
  it("resolves next to an absolute overview url (Vercel Blob)", () => {
    expect(
      chunkUrl(
        "https://x.public.blob.vercel-storage.com/geometry/t/v2-ab/overview.json",
        "s/3.json",
        "http://localhost:3000/events/a",
      ),
    ).toBe(
      "https://x.public.blob.vercel-storage.com/geometry/t/v2-ab/s/3.json",
    );
  });

  it("resolves a root-relative overview url (local blob) against the page", () => {
    expect(
      chunkUrl(
        "/local-blob/geometry/t/v1/overview.json",
        "s/0.json",
        "http://localhost:3000/events/a",
      ),
    ).toBe("http://localhost:3000/local-blob/geometry/t/v1/s/0.json");
  });
});
