import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import {
  applyMatrix,
  cleanRing,
  IDENTITY,
  multiply,
  parseTransform,
  pathToRing,
  polygonToRing,
  rectToRing,
  type Matrix,
} from "./svg-geometry";

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};

const at = (t: string, p: Point) => applyMatrix(ok(parseTransform(t)), p);

describe("parseTransform", () => {
  it("rỗng / thiếu → identity", () => {
    expect(ok(parseTransform(""))).toEqual(IDENTITY);
    expect(ok(parseTransform(undefined))).toEqual(IDENTITY);
  });

  it("translate, scale (1 hoặc 2 tham số), matrix", () => {
    close(at("translate(10 20)", [1, 1]), [11, 21]);
    close(at("translate(5)", [1, 1]), [6, 1]);
    close(at("scale(2)", [3, 4]), [6, 8]);
    close(at("scale(2,-1)", [3, 4]), [6, -4]);
    close(at("matrix(1 0 0 1 7 8)", [0, 0]), [7, 8]);
  });

  it("rotate quanh gốc và quanh điểm", () => {
    close(at("rotate(90)", [1, 0]), [0, 1]);
    close(at("rotate(180 5 5)", [6, 5]), [4, 5]);
  });

  it("skewX / skewY", () => {
    close(at("skewX(45)", [0, 1]), [1, 1]);
    close(at("skewY(45)", [1, 0]), [1, 1]);
  });

  it("chuỗi transform áp từ phải sang trái", () => {
    // scale trước rồi translate
    close(at("translate(10,0) scale(2)", [1, 1]), [12, 2]);
  });

  it("hàm lạ / sai số tham số → lỗi", () => {
    expect(parseTransform("skew(10)").ok).toBe(false);
    expect(parseTransform("matrix(1 0 0)").ok).toBe(false);
    expect(parseTransform("translate(1, 2) junk").ok).toBe(false);
  });
});

describe("multiply", () => {
  it("parent · child: child áp trước", () => {
    const parent: Matrix = ok(parseTransform("translate(100 0)"));
    const child: Matrix = ok(parseTransform("scale(2)"));
    close(applyMatrix(multiply(parent, child), [1, 1]), [102, 2]);
  });
});

describe("pathToRing", () => {
  // Outline bậc thang kiểu S311 (rút gọn)
  const stepped = "M708 122 H1925 V252 H1863 V284 H1800 V316 L708 316 Z";

  it("M/H/V/L/Z tuyệt đối → ring đóng", () => {
    expect(ok(pathToRing(stepped))).toEqual([
      [708, 122],
      [1925, 122],
      [1925, 252],
      [1863, 252],
      [1863, 284],
      [1800, 284],
      [1800, 316],
      [708, 316],
      [708, 122],
    ]);
  });

  it("lệnh tương đối + toạ độ ngầm sau M là lineto", () => {
    expect(ok(pathToRing("m10 10 20 0 v10 h-20 z"))).toEqual([
      [10, 10],
      [30, 10],
      [30, 20],
      [10, 20],
      [10, 10],
    ]);
  });

  it("số dính liền kiểu Illustrator (1.5.5, -3-4, 1e1)", () => {
    expect(ok(pathToRing("M0 0L1e1 0L1e1-10L.5.5z"))).toEqual([
      [0, 0],
      [10, 0],
      [10, -10],
      [0.5, 0.5],
      [0, 0],
    ]);
  });

  it("curve / nhiều subpath / ký tự lạ → lỗi", () => {
    expect(pathToRing("M0 0 C1 1 2 2 3 3 Z").ok).toBe(false);
    expect(pathToRing("M0 0 A5 5 0 0 1 10 0 Z").ok).toBe(false);
    expect(pathToRing("M0 0 H4 V4 Z M10 10 H14 V14 Z").ok).toBe(false);
    expect(pathToRing("M0 0 H4 # V4 Z").ok).toBe(false);
    expect(pathToRing("M0 0 L4").ok).toBe(false);
  });
});

describe("rectToRing / polygonToRing", () => {
  it("rect → 4 đỉnh, ring đóng", () => {
    expect(ok(rectToRing({ x: "1", y: "2", width: "3", height: "4" }))).toEqual(
      [
        [1, 2],
        [4, 2],
        [4, 6],
        [1, 6],
        [1, 2],
      ],
    );
  });

  it("rect thiếu x/y = 0; width/height không dương → lỗi", () => {
    expect(ok(rectToRing({ width: "2", height: "2" }))[0]).toEqual([0, 0]);
    expect(rectToRing({ width: "0", height: "2" }).ok).toBe(false);
    expect(rectToRing({ width: "abc", height: "2" }).ok).toBe(false);
  });

  it("polygon points (dấu phẩy / khoảng trắng)", () => {
    expect(ok(polygonToRing("0,0 4,0 4,3"))).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 0],
    ]);
    expect(polygonToRing("0,0 4,0 4").ok).toBe(false);
  });
});

describe("cleanRing", () => {
  it("bỏ điểm trùng liên tiếp và điểm thẳng hàng (kể cả điểm đầu), đóng ring", () => {
    const raw: Point[] = [
      [2, 0],
      [4, 0],
      [4, 0],
      [4, 2],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(ok(cleanRing(raw))).toEqual([
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
      [4, 0],
    ]);
  });

  it("dưới 3 đỉnh phân biệt → lỗi", () => {
    expect(
      cleanRing([
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 0],
      ]).ok,
    ).toBe(false);
  });

  it("không đổi input", () => {
    const raw: Point[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 2],
    ];
    const copy = structuredClone(raw);
    cleanRing(raw);
    expect(raw).toEqual(copy);
  });
});
