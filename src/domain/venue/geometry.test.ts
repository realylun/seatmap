import { beforeAll, describe, expect, it } from "vitest";
import {
  hasStudy,
  importStudyModule,
  loadVenueJson,
  VENUE_FILES,
} from "../__fixtures__/study";
import {
  centroid,
  facingEdge,
  frontEdgeLine,
  generateRows,
  nearestEdge,
  parseOverrides,
  rowNames,
  sectionDepth,
} from "./geometry";
import { venueFileSchema, type SectionConfig } from "./types";
import { DEFAULT_SECTION } from "./venue-file";

const square = (size: number): SectionConfig["ring"] => [
  [0, 0],
  [size, 0],
  [size, size],
  [0, size],
  [0, 0],
];

const section = (patch: Partial<SectionConfig> = {}): SectionConfig => ({
  ...DEFAULT_SECTION,
  rowSkip: [...DEFAULT_SECTION.rowSkip],
  id: "101",
  ring: square(4),
  ...patch,
});

describe("rowNames", () => {
  it("bỏ qua chữ trong skip", () => {
    expect(rowNames("G", 4, ["I", "O"])).toEqual(["G", "H", "J", "K"]);
  });
  it("đánh số khi start là số", () => {
    expect(rowNames("5", 3)).toEqual(["5", "6", "7"]);
  });
  it("sau Z là AA, BB", () => {
    expect(rowNames("Y", 4)).toEqual(["Y", "Z", "AA", "BB"]);
  });
});

describe("parseOverrides", () => {
  it("parse 'A:12, b:14', bỏ giá trị không hợp lệ", () => {
    expect(parseOverrides("A:12, b:14, C:0, :5, D:x")).toEqual({
      A: 12,
      B: 14,
    });
  });
  it("chuỗi rỗng → {}", () => {
    expect(parseOverrides("")).toEqual({});
  });
});

describe("generateRows", () => {
  it("rải ghế theo seatSpacing trong hình vuông", () => {
    const rows = generateRows(section({ rowCount: 2, seatSpacing: 1 }));
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
    expect(rows[0].seats).toHaveLength(4); // usable = 4 - 1 = 3 → 3/1 + 1
    expect(rows[0].seats[0]).toEqual([0.5, 1]);
    expect(rows[0].line).toEqual([
      [0, 1],
      [4, 1],
    ]);
  });
  it("override theo tên row và seatsPerRow", () => {
    const rows = generateRows(
      section({ rowCount: 2, seatsPerRow: 3, overrides: "B:5" }),
    );
    expect(rows.map((r) => r.seats.length)).toEqual([3, 5]);
  });
  it("rtl đảo thứ tự ghế", () => {
    const ltr = generateRows(section({ rowCount: 1 }))[0].seats;
    const rtl = generateRows(section({ rowCount: 1, numbering: "rtl" }))[0]
      .seats;
    expect(rtl).toEqual(ltr.toReversed());
  });
  it("không mutate input", () => {
    const input = Object.freeze(section());
    expect(() => generateRows(input)).not.toThrow();
  });
});

describe("hình học cạnh", () => {
  it("centroid / depth / frontEdgeLine", () => {
    expect(centroid(square(2))).toEqual([1, 1]);
    expect(sectionDepth(square(2), 0)).toBe(2);
    expect(frontEdgeLine(square(2), -1)).toEqual([
      [0, 2],
      [0, 0],
    ]);
  });
  it("facingEdge chọn cạnh dài phía trong, nearestEdge chọn cạnh ngắn (section 346)", () => {
    const ring: SectionConfig["ring"] = [
      [-8.16, 13.32],
      [-8.05, 13.32],
      [-7.97, 12.85],
      [-9.3, 12.58],
      [-9.41, 13.05],
      [-8.16, 13.32],
    ];
    expect(nearestEdge(ring, [0, 0])).toBe(1);
    expect(facingEdge(ring, [0, 0])).toBe(2);
  });
});

type GeometryJs = typeof import("./geometry");

describe.skipIf(!hasStudy)("parity với geometry.js gốc (AC4)", () => {
  let js: GeometryJs;
  beforeAll(async () => {
    js = await importStudyModule<GeometryJs>("seatmap-editor/geometry.js");
  });

  it.each(VENUE_FILES)(
    "generateRows deep-equal trên mọi section của %s",
    (name) => {
      const { editor } = venueFileSchema.parse(loadVenueJson(name));
      expect(editor.sections.length).toBeGreaterThan(0);
      for (const s of editor.sections) {
        expect(generateRows(s)).toEqual(js.generateRows(s));
        expect(facingEdge(s.ring, [0, 0])).toBe(js.facingEdge(s.ring, [0, 0]));
        expect(nearestEdge(s.ring, [0, 0])).toBe(
          js.nearestEdge(s.ring, [0, 0]),
        );
        expect(sectionDepth(s.ring, s.frontEdge)).toBe(
          js.sectionDepth(s.ring, s.frontEdge),
        );
      }
    },
  );

  it("rowNames / parseOverrides khớp trên input biên", () => {
    const cases: [string, number, string[]][] = [
      ["A", 30, ["I", "O"]],
      ["x", 5, []],
      ["10", 4, []],
    ];
    for (const [start, count, skip] of cases) {
      expect(rowNames(start, count, skip)).toEqual(
        js.rowNames(start, count, skip),
      );
    }
    expect(parseOverrides("a:3,B : 7,,C:-1")).toEqual(
      js.parseOverrides("a:3,B : 7,,C:-1"),
    );
  });
});
