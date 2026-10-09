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

  it("SVG lỗi → throw kèm thông báo", () => {
    expect(() => venueFileFromSvg("<svg></svg>")).toThrow(/lỗi/);
  });
});
