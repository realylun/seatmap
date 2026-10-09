import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pointInRing } from "../geometry";
import { venueFileSchema } from "../types";
import { addSections, exportFile, type VenueDraft } from "../venue-file";
import { svgToDrafts, type SvgImport } from "./svg-venue";

const fixture = readFileSync(
  new URL("./fixtures/s311.svg", import.meta.url),
  "utf8",
);

const svg = (body: string, viewBox = "0 0 100 100") =>
  `<svg viewBox="${viewBox}">${body}</svg>`;

const errors = (r: SvgImport) => r.issues.filter((i) => i.level === "error");
const messages = (r: SvgImport) => r.issues.map((i) => i.message).join("\n");

const square = `<rect data-role="outline" x="10" y="10" width="40" height="40"/>`;
const field = `<rect id="field" x="0" y="90" width="100" height="10"/>`;

describe("svgToDrafts: fixture S311", () => {
  const result = svgToDrafts(fixture);

  it("không có lỗi; 2 khu + sân", () => {
    expect(errors(result)).toEqual([]);
    expect(result.drafts.map((d) => d.id)).toEqual(["311", "312"]);
    expect(result.objects).toHaveLength(1);
    expect(result.extent).toEqual({ w: (20 * 2000) / 1150, h: 20 });
  });

  it("311: 30 row, 510 ghế đặt tay, tất cả nằm trong outline", () => {
    const s311 = result.drafts[0];
    const rows = s311.explicitRows ?? [];
    expect(rows).toHaveLength(30);
    expect(rows.flatMap((r) => r.seats)).toHaveLength(510);
    expect(s311.rowCount).toBe(30);
    for (const seat of rows.flatMap((r) => r.seats))
      expect(pointInRing(seat.at, s311.ring)).toBe(true);
  });

  it("outline bậc thang giữ đủ góc (không bị làm tròn / gộp sai)", () => {
    // 30 cột, đỉnh và đáy đều bậc thang → hàng chục đỉnh
    expect(result.drafts[0].ring.length).toBeGreaterThan(40);
  });

  it("312 (id kiểu Figma): bỏ hậu tố chống trùng, 5 ghế row A", () => {
    const rows = result.drafts[1].explicitRows ?? [];
    expect(rows.map((r) => r.name)).toEqual(["A"]);
    expect(
      rows[0].seats.map((s) => s.number).toSorted((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("y SVG hướng xuống → y map hướng lên (ghế 1 ở dưới có y nhỏ hơn)", () => {
    const rowA = result.drafts[0].explicitRows?.[0];
    const [s1, s2] = [rowA?.seats[0].at, rowA?.seats[1].at];
    expect(s1?.[1]).toBeLessThan(s2?.[1] ?? 0);
  });

  it("round-trip: addSections → exportFile hợp lệ theo schema", () => {
    const empty: VenueDraft = {
      extent: result.extent,
      sections: [],
      selectedId: null,
    };
    const state = {
      ...addSections(empty, result.drafts),
      objects: result.objects,
    };
    const file = venueFileSchema.parse(exportFile(state));
    expect(file.geojson.seats.features).toHaveLength(515);
    expect(file.sections[0].rows[0].seats[0].properties.seat).toBe(1);
  });
});

describe("svgToDrafts: lỗi", () => {
  it("SVG hỏng → 1 lỗi, không có khu", () => {
    const r = svgToDrafts("<svg>");
    expect(errors(r)).toHaveLength(1);
    expect(r.drafts).toEqual([]);
  });

  it("ghế nằm ngoài outline", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}
        <circle data-row="A" data-seat="1" cx="80" cy="80" r="2"/></g>${field}`),
    );
    expect(messages(r)).toMatch(/ngoài outline/);
  });

  it("ghế chạm mép (trong bán kính) vẫn hợp lệ", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}
        <circle data-row="A" data-seat="1" cx="51" cy="30" r="2"/></g>${field}`),
    );
    expect(errors(r)).toEqual([]);
  });

  it("trùng số ghế, thiếu row, số ghế sai", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}
        <circle data-row="A" data-seat="1" cx="20" cy="20" r="2"/>
        <circle data-row="A" data-seat="1" cx="30" cy="20" r="2"/>
        <circle data-seat="2" cx="30" cy="30" r="2"/>
        <circle data-row="B" data-seat="x" cx="30" cy="40" r="2"/></g>${field}`),
    );
    const text = messages(r);
    expect(text).toMatch(/trùng/);
    expect(text).toMatch(/thiếu data-row/);
    expect(text).toMatch(/số ghế/);
    expect(r.drafts).toEqual([]);
  });

  it("khu có 2 outline (trùng id) / không có outline", () => {
    const twice = svgToDrafts(
      svg(
        `<g data-section="1">${square}</g><g data-section="1">${square}</g>${field}`,
      ),
    );
    expect(messages(twice)).toMatch(/2 outline/);
    const none = svgToDrafts(
      svg(`<g data-section="1"><circle data-row="A" data-seat="1"/></g>`),
    );
    expect(messages(none)).toMatch(/không có outline/);
  });

  it("outline dùng curve → lỗi có id khu", () => {
    const r = svgToDrafts(
      svg(
        `<g data-section="9"><path data-role="outline" d="M0 0 C1 1 2 2 3 3 Z"/></g>`,
      ),
    );
    expect(errors(r)[0].message).toMatch(/đoạn thẳng/);
    expect(errors(r)[0].section).toBe("9");
  });

  it("tham số khu sai kiểu", () => {
    const r = svgToDrafts(
      svg(
        `<g data-section="1" data-rows="mười" data-numbering="up">${square}</g>`,
      ),
    );
    expect(messages(r)).toMatch(/data-rows/);
    expect(messages(r)).toMatch(/data-numbering/);
  });
});

describe("svgToDrafts: cảnh báo + sinh tự động", () => {
  it("khu không có ghế → sinh tự động theo data-*; thiếu sân → cảnh báo", () => {
    const r = svgToDrafts(
      svg(
        `<g data-section="1" data-rows="5" data-row-start="1" data-seats-per-row="8" data-numbering="rtl" data-row-skip="" data-seat-spacing="0.5" data-overrides="1:4">${square}</g>`,
      ),
    );
    expect(errors(r)).toEqual([]);
    expect(r.drafts[0]).toMatchObject({
      rowCount: 5,
      rowStart: "1",
      seatsPerRow: 8,
      numbering: "rtl",
      rowSkip: [],
      seatSpacing: 0.5,
      overrides: "1:4",
    });
    expect(r.drafts[0].explicitRows).toBeUndefined();
    const text = messages(r);
    expect(text).toMatch(/không có ghế/);
    expect(text).toMatch(/sân/);
  });

  it("data-front-edge ghi đè cạnh trước tự tính", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1" data-front-edge="2">${square}</g>${field}`),
    );
    expect(r.drafts[0].frontEdge).toBe(2);
  });

  it("<image> nhúng và <use> → cảnh báo, không chặn", () => {
    const r = svgToDrafts(
      svg(
        `<image href="a.png"/><use href="#x"/><g data-section="1">${square}<circle data-row="A" data-seat="1" cx="20" cy="20" r="2"/></g>${field}`,
      ),
    );
    expect(errors(r)).toEqual([]);
    expect(messages(r)).toMatch(/ảnh raster/);
    expect(messages(r)).toMatch(/<use>/);
  });

  it("ellipse tròn được coi là ghế; ellipse dẹt → lỗi", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}
        <ellipse data-row="A" data-seat="1" cx="20" cy="20" rx="2" ry="2"/>
        <ellipse data-row="A" data-seat="2" cx="30" cy="20" rx="4" ry="1"/></g>${field}`),
    );
    expect(messages(r)).toMatch(/ellipse/);
  });
});

const seat = (n: number, x = 20) =>
  `<circle data-row="A" data-seat="${n}" cx="${x}" cy="20" r="2"/>`;

describe("svgToDrafts: sau review", () => {
  it("hình trong row không có số ghế → lỗi (không bị bỏ qua lặng lẽ)", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}<g data-row="A">
        <circle data-seat="1" cx="20" cy="20" r="2"/>
        <circle id="Ellipse 12" cx="30" cy="20" r="2"/></g></g>${field}`),
    );
    expect(messages(r)).toMatch(/không có số ghế/);
    expect(r.drafts).toEqual([]);
  });

  it("hình trang trí trong khu (đã có outline đánh dấu) → 1 cảnh báo gộp", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}${seat(1)}
        <rect x="12" y="40" width="2" height="2"/><line x1="0" y1="0" x2="1" y2="1"/></g>${field}`),
    );
    expect(errors(r)).toEqual([]);
    expect(messages(r)).toMatch(/bỏ qua 2 hình/);
  });

  it("group field có hình curve → chỉ cảnh báo; sân tròn được nhận", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1">${square}${seat(1)}</g>
        <g id="field"><circle cx="50" cy="90" r="8"/>
          <path d="M0 95 C10 90 20 90 30 95 Z"/></g>`),
    );
    expect(errors(r)).toEqual([]);
    expect(r.objects).toHaveLength(1);
    expect(messages(r)).toMatch(/Sân .* bị bỏ qua/);
    expect(messages(r)).not.toMatch(/Không có sân/);
  });

  it("data-front-edge ngoài khoảng số cạnh → lỗi", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1" data-front-edge="4">${square}</g>${field}`),
    );
    expect(messages(r)).toMatch(/0…3/);
    const negative = svgToDrafts(
      svg(`<g data-section="1" data-front-edge="-1">${square}</g>${field}`),
    );
    expect(errors(negative)).toHaveLength(1);
  });

  it("tham số quá lớn / không hữu hạn → lỗi", () => {
    const r = svgToDrafts(
      svg(
        `<g data-section="1" data-rows="100000" data-seats-per-row="9999" data-seat-spacing="Infinity">${square}</g>${field}`,
      ),
    );
    expect(errors(r)).toHaveLength(3);
  });

  it("ghế kiểm tra trong khu theo toạ độ bản vẽ, kể cả khi group có transform", () => {
    const r = svgToDrafts(
      svg(`<g data-section="1" transform="translate(40 0)">${square}
        <circle data-row="A" data-seat="1" cx="20" cy="20" r="2"/></g>${field}`),
    );
    expect(errors(r)).toEqual([]);
  });
});
