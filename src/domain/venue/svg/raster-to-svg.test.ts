import { describe, expect, it } from "vitest";
import { dominantSectionColor, rasterToSvg } from "./raster-to-svg";
import { svgToDrafts } from "./svg-venue";

type Rgb = readonly [number, number, number];
type Rect = readonly [x: number, y: number, w: number, h: number];

const SECTION: Rgb = [231, 230, 232];
const BORDER: Rgb = [174, 173, 175];
const STAGE: Rgb = [77, 77, 77];
const WHITE: Rgb = [255, 255, 255];

function image(size: number, paint: (x: number, y: number) => Rgb) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      data.set([...paint(x, y), 255], i);
    }
  return { width: size, height: size, data };
}

const inside = ([rx, ry, rw, rh]: Rect, x: number, y: number) =>
  x >= rx && y >= ry && x < rx + rw && y < ry + rh;

function venue(
  extra: (x: number, y: number) => Rgb | undefined = () => undefined,
) {
  const sections: Rect[] = [
    [20, 20, 40, 20],
    [140, 20, 40, 20],
    [20, 160, 40, 20],
  ];
  const stage: Rect = [80, 80, 40, 40];
  const hole: Rect = [90, 90, 20, 20];
  return image(200, (x, y) => {
    const painted = extra(x, y);
    if (painted) return painted;
    if (inside(hole, x, y)) return SECTION;
    if (inside(stage, x, y)) return STAGE;
    const section = sections.find((r) => inside(r, x, y));
    if (!section) return WHITE;
    const isEdge = !inside(
      [section[0] + 1, section[1] + 1, section[2] - 2, section[3] - 2],
      x,
      y,
    );
    return isEdge ? BORDER : SECTION;
  });
}

const sectionIds = (svg: string) =>
  [...svg.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);

const cross = (x: number, y: number) => {
  const [dx, dy] = [x - 150, y - 150];
  const onCross =
    Math.abs(dx) <= 15 &&
    Math.abs(dy) <= 15 &&
    (Math.abs(dx - dy) <= 2 || Math.abs(dx + dy) <= 2);
  return onCross ? SECTION : undefined;
};
const blue = (x: number, y: number) =>
  inside([150, 60, 30, 20], x, y) ? ([200, 210, 250] as Rgb) : undefined;

describe("dominantSectionColor", () => {
  it("chọn màu sáng không trắng nhiều nhất", () => {
    expect(dominantSectionColor(venue())).toEqual(SECTION);
  });

  it("báo lỗi khi ảnh không có màu khu", () => {
    expect(() => dominantSectionColor(image(10, () => WHITE))).toThrow();
  });
});

describe("rasterToSvg", () => {
  it("mỗi vùng màu khu thành 1 khu, sân khấu thành id=stage, nhập lại không lỗi", () => {
    const result = rasterToSvg(venue());
    expect(result.sections).toBe(3);
    expect(result.stages).toBe(1);
    expect(result.dropped.insideStage).toBe(1);
    const check = svgToDrafts(result.svg);
    expect(check.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(check.drafts).toHaveLength(3);
    expect(check.objects).toHaveLength(1);
  });

  it("đặt tên theo tầng rồi chiều kim đồng hồ từ 12h, không trùng", () => {
    const ids = sectionIds(rasterToSvg(venue()).svg);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^T\d+-\d{3}$/.test(id))).toBe(true);
  });

  it("loại vùng khác màu và hình chữ X", () => {
    const result = rasterToSvg(venue((x, y) => cross(x, y) ?? blue(x, y)));
    expect(result.sections).toBe(3);
    expect(result.dropped.solidity).toBe(1);
    expect(result.dropped.color).toBe(1);
  });

  it("outline chỉ dùng M/L/Z", () => {
    const paths = [...rasterToSvg(venue()).svg.matchAll(/ d="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(paths.length).toBe(3);
    for (const d of paths) expect(d).toMatch(/^M[\d .L]+Z$/);
  });

  it("seatSpacing → data-seat-spacing trên mọi khu, editor đọc được", () => {
    const result = rasterToSvg(venue(), { seatSpacing: 0.12 });
    expect(result.svg.match(/data-seat-spacing="0.12"/g)).toHaveLength(3);
    const check = svgToDrafts(result.svg);
    expect(check.drafts.map((d) => d.seatSpacing)).toEqual([0.12, 0.12, 0.12]);
  });

  it("seatSpacing không dương → báo lỗi", () => {
    expect(() => rasterToSvg(venue(), { seatSpacing: 0 })).toThrow();
  });
});
