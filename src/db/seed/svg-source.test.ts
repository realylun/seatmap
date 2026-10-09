import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editorBlockSchema } from "@/domain/venue/types";
import { buildVenue } from "@/domain/venue/venue-file";
import { venueFileFromSvg } from "./svg-source";

const attSvg = readFileSync(
  new URL("../../../data/venues/att-stadium.svg", import.meta.url),
  "utf8",
);

describe("venueFileFromSvg", () => {
  it("AT&T Stadium: SVG seed nhập không lỗi, đủ khu và ghế", () => {
    const { editor } = venueFileFromSvg(attSvg);
    const block = editorBlockSchema.parse(editor);
    expect(block.sections.length).toBeGreaterThan(600);
    expect(block.objects?.length).toBeGreaterThan(0);
    const venue = buildVenue(block);
    const seats = venue.sections.map((s) =>
      s.rows.reduce((n, r) => n + r.seats.length, 0),
    );
    expect(seats.every((n) => n > 0)).toBe(true);
    expect(seats.reduce((a, b) => a + b, 0)).toBeGreaterThan(10_000);
  });

  it("id khu là duy nhất", () => {
    const ids = venueFileFromSvg(attSvg).editor.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Trống Đồng (giả lập): 160 khu, đúng 135.000 ghế, row 1 gần sân nhất", () => {
    const trongDongSvg = readFileSync(
      new URL("../../../data/venues/trong-dong.svg", import.meta.url),
      "utf8",
    );
    const venue = buildVenue(venueFileFromSvg(trongDongSvg).editor);
    expect(venue.sections).toHaveLength(160);
    const seats = venue.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
    expect(seats.length).toBe(135_000);
    // Tâm sân trùng gốc toạ độ map (sân nằm giữa viewBox vuông)
    type Row = (typeof venue.sections)[number]["rows"][number];
    const meanDistance = (row: Row) =>
      row.seats.reduce((d, s) => d + Math.hypot(...s.geometry.coordinates), 0) /
      row.seats.length;
    const reversed = venue.sections.filter(
      ({ rows }) =>
        rows[0].feature.properties.row !== "1" ||
        meanDistance(rows[0]) >= meanDistance(rows.at(-1)!),
    );
    expect(reversed.map((s) => s.id)).toEqual([]);
  });

  it("SVG lỗi → throw kèm thông báo", () => {
    expect(() => venueFileFromSvg("<svg></svg>")).toThrow(/lỗi/);
  });
});
