import { describe, expect, it } from "vitest";
import { sectionChunkSchema, venueOverviewSchema } from "./overview";
import { medianSeatSpacing } from "./seat-spacing";
import { serializeGeometry } from "./geometry-json";
import { chunkSeatFeatures, splitVenue } from "./split";
import type { SectionConfig, Venue } from "./types";
import { buildVenue } from "./venue-file";

const section = (
  id: string,
  x: number,
  overrides: Partial<SectionConfig> = {},
): SectionConfig => ({
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
  ...overrides,
});

const venue = buildVenue({
  extent: { w: 20, h: 10 },
  sections: [
    section("101", 0),
    section("102", 6, { seatsPerRow: 4 }),
    // ghế đặt tay: tên row không theo thứ tự, số ghế ngắt quãng
    section("103", 12, {
      explicitRows: [
        {
          name: "B",
          seats: [
            { number: 7, at: [13, 2] },
            { number: 2, at: [12.5, 2] },
          ],
        },
        { name: "A", seats: [{ number: 1, at: [12.5, 1] }] },
      ],
    }),
  ],
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

// như lúc publish: serializeGeometry làm tròn toạ độ rồi upload
const roundTrip = (value: unknown): unknown =>
  JSON.parse(serializeGeometry(value));

/** Venue hợp lệ theo venueSchema nhưng buildVenue không tạo ra: thêm row rỗng vào section đầu */
function withEmptyRow(v: Venue): Venue {
  const [first, ...rest] = v.sections;
  const row = {
    feature: {
      type: "Feature" as const,
      properties: { section: first.id, row: "Z", seats: 0 },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [0, 3],
          [4, 3],
        ] as [[number, number], [number, number]],
      },
    },
    seats: [],
  };
  return {
    ...v,
    sections: [{ ...first, rows: [...first.rows, row] }, ...rest],
  };
}

describe("splitVenue", () => {
  it("writes one chunk per section, referenced from the overview", () => {
    const { overview, chunks } = splitVenue(venue);
    expect(chunks.map((c) => c.path)).toEqual([
      "s/0.json",
      "s/1.json",
      "s/2.json",
    ]);
    expect(overview.sections.map((s) => [s.id, s.chunk, s.seatCount])).toEqual([
      ["101", "s/0.json", 6],
      ["102", "s/1.json", 8],
      ["103", "s/2.json", 3],
    ]);
    expect(chunks.map((c) => c.chunk.section)).toEqual(["101", "102", "103"]);
  });

  it("chunks together hold exactly the venue seats, in order", () => {
    const { chunks } = splitVenue(venue);
    const seats = chunks.flatMap((c) => chunkSeatFeatures(c.chunk));
    expect(seats).toEqual(venue.geojson.seats.features);
  });

  it("keeps everything the first paint needs in the overview", () => {
    const { overview } = splitVenue(venue);
    expect(overview.bounds).toEqual(venue.bounds);
    expect(overview.field).toEqual(venue.geojson.field);
    expect(overview.rows).toEqual(venue.geojson.rows);
    expect(overview.sections.map((s) => s.center)).toEqual(
      venue.sections.map((s) => s.center),
    );
    expect(overview.sections.map((s) => s.polygon)).toEqual(
      venue.sections.map((s) => s.feature.geometry.coordinates),
    );
    expect(Object.keys(overview).toSorted()).toEqual([
      "bounds",
      "field",
      "rows",
      "seatSpacing",
      "sections",
      "version",
    ]);
  });

  it("uses the precomputed seat spacing, measuring only when missing", () => {
    expect(
      splitVenue({ ...venue, seatSpacing: 0.42 }).overview.seatSpacing,
    ).toBe(0.42);
    expect(splitVenue(venue).overview.seatSpacing).toBe(
      medianSeatSpacing(venue.geojson.seats),
    );
  });

  it("keeps overview rows and chunk rows one-to-one, empty rows included", () => {
    const { overview, chunks } = splitVenue(withEmptyRow(venue));
    const chunkRows = chunks.flatMap((c) =>
      c.chunk.rows.map((r) => [c.chunk.section, r.name, r.seats.length]),
    );
    const overviewRows = overview.rows.features.map((f) => [
      f.properties.section,
      f.properties.row,
      f.properties.seats,
    ]);
    expect(chunkRows).toEqual(overviewRows);
    expect(chunkRows).toContainEqual(["101", "Z", 0]);
    for (const [i, s] of overview.sections.entries()) {
      const seats = chunks[i].chunk.rows.reduce(
        (n, r) => n + r.seats.length,
        0,
      );
      expect(s.seatCount).toBe(seats);
    }
  });

  it("refuses duplicate section ids", () => {
    const [first] = venue.sections;
    const dup = { ...venue, sections: [...venue.sections, first] };
    expect(() => splitVenue(dup)).toThrow(/101/);
  });

  it("refuses seats whose section / row disagree with their parent", () => {
    const [first, ...rest] = venue.sections;
    const [row, ...rows] = first.rows;
    const [seat, ...seats] = row.seats;
    const moved = {
      ...seat,
      properties: { ...seat.properties, row: "a" },
    };
    const broken = {
      ...venue,
      sections: [
        { ...first, rows: [{ ...row, seats: [moved, ...seats] }, ...rows] },
        ...rest,
      ],
    };
    expect(() => splitVenue(broken)).toThrow(/101/);
  });

  it("gives a section without seats an empty chunk", () => {
    const empty = buildVenue({
      extent: { w: 20, h: 10 },
      sections: [section("101", 0), section("GA", 6, { rowCount: 0 })],
    });
    const { overview, chunks } = splitVenue(empty);
    expect(overview.sections[1].seatCount).toBe(0);
    expect(chunks[1].chunk).toEqual({ version: 1, section: "GA", rows: [] });
  });

  it("produces JSON that the overview / chunk schemas accept", () => {
    const { overview, chunks } = splitVenue(withEmptyRow(venue));
    const json = roundTrip(overview);
    // schema không làm rơi trường nào của file đã làm tròn
    expect(venueOverviewSchema.parse(json)).toEqual(json);
    for (const { chunk } of chunks) {
      const chunkJson = roundTrip(chunk);
      expect(sectionChunkSchema.parse(chunkJson)).toEqual(chunkJson);
    }
  });
});

describe("overview / chunk schemas", () => {
  it("reject malformed seats and unknown versions", () => {
    const { overview, chunks } = splitVenue(venue);
    const chunk = chunks[0].chunk;
    const badSeat = {
      ...chunk,
      rows: [{ name: "A", seats: [[0, 1, 2]] }],
    };
    expect(sectionChunkSchema.safeParse(badSeat).success).toBe(false);
    expect(sectionChunkSchema.safeParse({ ...chunk, version: 2 }).success).toBe(
      false,
    );
    expect(
      venueOverviewSchema.safeParse({ ...overview, version: 2 }).success,
    ).toBe(false);
    expect(
      venueOverviewSchema.safeParse({
        ...overview,
        sections: [{ ...overview.sections[0], chunk: "" }],
      }).success,
    ).toBe(false);
  });
});
