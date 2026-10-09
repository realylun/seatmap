import { beforeAll, describe, expect, it } from "vitest";
import { hasStudy, importStudyModule } from "../__fixtures__/study";
import {
  detectDarkObjects,
  detectSections,
  pointInRing,
  type ImageLike,
} from "./detect";

type Rgb = readonly [number, number, number];
type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: Rgb;
};

const WHITE: Rgb = [255, 255, 255];
const BLUE: Rgb = [170, 200, 250];
const GREEN: Rgb = [190, 235, 190];
const STAGE: Rgb = [40, 40, 40];

// Ảnh tổng hợp: nền trắng + các khối màu (section sáng, sân khấu tối)
function paint(
  width: number,
  height: number,
  rects: readonly Rect[],
): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const x = p % width;
    const y = Math.floor(p / width);
    const hit = rects.findLast(
      (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
    );
    data.set([...(hit?.color ?? WHITE), 255], p * 4);
  }
  return { width, height, data };
}

const image = paint(200, 200, [
  { x: 20, y: 20, w: 30, h: 20, color: BLUE },
  { x: 120, y: 30, w: 25, h: 40, color: GREEN },
  { x: 80, y: 140, w: 40, h: 20, color: STAGE },
]);

describe("detectSections", () => {
  it("tìm đúng 2 khối sáng, bỏ nền trắng (chạm viền + quá lớn) và khối tối", () => {
    const found = detectSections(image);
    expect(found.map((s) => s.bbox)).toEqual([
      { x: 20, y: 20, w: 30, h: 20 },
      { x: 120, y: 30, w: 25, h: 40 },
    ]);
    const [first] = found;
    expect(first.area).toBe(600);
    expect(first.center).toEqual([34.5, 29.5]);
    expect(first.ring[0]).toEqual(first.ring.at(-1));
    // giản lược còn vài đỉnh, đủ 4 góc pixel của hình chữ nhật
    expect(first.ring.length).toBeLessThanOrEqual(6);
    expect(first.ring).toEqual(
      expect.arrayContaining([
        [20, 20],
        [49, 20],
        [49, 39],
        [20, 39],
      ]),
    );
    expect(pointInRing(first.center, first.ring)).toBe(true);
  });

  it("giữ dải row mỏng nhỏ, loại khe sáng 1–2px giữa 2 đường viền", () => {
    const GREY: Rgb = [170, 170, 170];
    const stadium = paint(1024, 1024, [
      { x: 100, y: 100, w: 25, h: 5, color: BLUE }, // dải row 125px (< 0.0003 × 1024²)
      { x: 300, y: 100, w: 1, h: 180, color: GREY }, // viền
      { x: 301, y: 100, w: 2, h: 180, color: GREEN }, // khe sáng 2px
      { x: 303, y: 100, w: 1, h: 180, color: GREY }, // viền
    ]);
    const found = detectSections(stadium);
    expect(found.map((s) => s.bbox)).toEqual([{ x: 100, y: 100, w: 25, h: 5 }]);
  });

  it("minAreaRatio cao → loại hết", () => {
    expect(
      detectSections(image, { minAreaRatio: 0.05, maxAreaRatio: 1 }),
    ).toEqual([]);
  });

  it("không mutate ảnh đầu vào", () => {
    const before = Array.from(image.data);
    detectSections(image);
    detectDarkObjects(image);
    expect(Array.from(image.data)).toEqual(before);
  });
});

describe("detectDarkObjects", () => {
  it("tìm khối sân khấu tối", () => {
    const found = detectDarkObjects(image);
    expect(found.map((s) => s.bbox)).toEqual([{ x: 80, y: 140, w: 40, h: 20 }]);
  });
});

describe("pointInRing", () => {
  const square = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ] as [number, number][];
  it("trong / ngoài", () => {
    expect(pointInRing([1, 1], square)).toBe(true);
    expect(pointInRing([3, 1], square)).toBe(false);
  });
});

type DetectJs = typeof import("./detect");

describe.skipIf(!hasStudy)("parity với detect.js gốc", () => {
  let js: DetectJs;
  beforeAll(async () => {
    js = await importStudyModule<DetectJs>("seatmap-editor/detect.js");
  });

  it("detectSections + detectDarkObjects deep-equal", () => {
    expect(detectSections(image)).toEqual(js.detectSections(image));
    expect(detectDarkObjects(image)).toEqual(js.detectDarkObjects(image));
  });
});
