// Nhận diện section từ ảnh sơ đồ (thuần pixel, không phụ thuộc map) — port của
// seatgeek-study/seatmap-editor/detect.js:
// 1) flood fill các vùng sáng cùng màu  2) lọc theo diện tích  3) dò viền ngoài  4) giản lược đỉnh
import type { Point } from "./types";

/** Tương thích ImageData của DOM nhưng không phụ thuộc DOM (chạy được trong worker / node) */
export type ImageLike = {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
};

export type DetectOptions = {
  readonly minLuminance: number;
  readonly colorTolerance: number;
  readonly minAreaRatio: number;
  readonly maxAreaRatio: number;
  readonly simplifyPx: number;
  readonly minFillRatio: number;
  readonly minThicknessPx: number;
};

export type DarkObjectOptions = {
  readonly maxLuminance: number;
  readonly minAreaRatio: number;
  readonly simplifyPx: number;
  readonly colorTolerance: number;
};

export type BBox = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** Toạ độ pixel; ring khép kín (điểm cuối = điểm đầu) */
export type DetectedShape = {
  readonly ring: Point[];
  readonly bbox: BBox;
  readonly center: Point;
  readonly area: number;
};

export const DETECT_DEFAULTS: DetectOptions = {
  minLuminance: 150, // pixel tối hơn = viền/chữ, không thuộc vùng nào
  colorTolerance: 22, // chênh màu tối đa so với pixel gốc của vùng
  // vùng nhỏ hơn (so với cả ảnh) = nhiễu. 0.0003 cũ (~315px ở ảnh 1024²) bỏ mất các dải row mỏng
  // (~25×5px) và block nhỏ của sơ đồ sân vận động; đường kẻ mảnh đã có minThicknessPx lo
  minAreaRatio: 0.00005,
  maxAreaRatio: 0.04, // vùng lớn hơn = nền, khu sàn lớn
  simplifyPx: 1.6,
  minFillRatio: 0.2, // diện tích / khung bao: vùng mảnh như vòng lối đi, khung viền màu → loại
  minThicknessPx: 2.25, // diện tích / cạnh dài khung bao: khe sáng 1–2px giữa 2 đường viền → loại
};

export const DARK_DEFAULTS: DarkObjectOptions = {
  maxLuminance: 110,
  minAreaRatio: 0.0004,
  simplifyPx: 1.6,
  colorTolerance: 40,
};

type Region = {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  start: number;
};

// Duyệt 8 hướng theo chiều kim đồng hồ, bắt đầu từ hướng Tây
const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];

function luminance(d: ArrayLike<number>, i: number) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

function colorDistance(d: ArrayLike<number>, i: number, j: number) {
  return (
    Math.abs(d[i] - d[j]) +
    Math.abs(d[i + 1] - d[j + 1]) +
    Math.abs(d[i + 2] - d[j + 2])
  );
}

function growRegion(region: Region, p: number, w: number) {
  const x = p % w;
  const y = (p - x) / w;
  region.area += 1;
  region.sumX += x;
  region.sumY += y;
  region.minX = Math.min(region.minX, x);
  region.maxX = Math.max(region.maxX, x);
  region.minY = Math.min(region.minY, y);
  region.maxY = Math.max(region.maxY, y);
  return { x, y };
}

// Gán nhãn vùng: labels[p] = id vùng (0 = không thuộc vùng nào). Buffer labels/stack/region là
// cục bộ của hàm (không đụng input) — dùng mutable để flood fill O(n) trên ảnh lớn.
// isCandidate(offset) quyết định pixel nào được gom: vùng sáng (section) hoặc vùng tối (sân khấu)
function labelRegions(
  image: ImageLike,
  colorTolerance: number,
  isCandidate: (offset: number) => boolean,
) {
  const { width: w, height: h, data } = image;
  const labels = new Int32Array(w * h);
  const regions: Region[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    const isSeed = labels[start] === 0 && isCandidate(start * 4);
    if (!isSeed) continue;
    const id = regions.length + 1;
    const region: Region = {
      id,
      area: 0,
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
      sumX: 0,
      sumY: 0,
      start,
    };
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const p = stack[--top];
      const { x, y } = growRegion(region, p, w);
      const neighbors = [
        x > 0 && p - 1,
        x < w - 1 && p + 1,
        y > 0 && p - w,
        y < h - 1 && p + w,
      ];
      for (const q of neighbors) {
        const isSameRegion =
          q !== false &&
          labels[q] === 0 &&
          isCandidate(q * 4) &&
          colorDistance(data, q * 4, start * 4) <= colorTolerance;
        if (!isSameRegion) continue;
        labels[q] = id;
        stack[top++] = q;
      }
    }
    regions.push(region);
  }
  return { labels, regions };
}

// Moore-neighbor tracing: đi dọc viền ngoài của vùng, trả về danh sách pixel [x,y]
function traceContour(
  labels: Int32Array,
  w: number,
  h: number,
  region: Region,
): Point[] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === region.id;
  const sx = region.start % w;
  const sy = (region.start - sx) / w;
  const contour: Point[] = [[sx, sy]];
  let [cx, cy] = [sx, sy];
  let back = 0; // pixel bắt đầu là pixel đầu tiên theo thứ tự quét → bên Tây chắc chắn ở ngoài
  const maxSteps = region.area * 4 + 16;
  for (let step = 0; step < maxSteps; step += 1) {
    let found = -1;
    for (let k = 1; k <= 8; k += 1) {
      const i = (back + k) % 8;
      if (inside(cx + DX[i], cy + DY[i])) {
        found = i;
        break;
      }
    }
    if (found < 0) break; // vùng 1 pixel
    const prev = (found + 7) % 8;
    const [nx, ny] = [cx + DX[found], cy + DY[found]];
    const [bx, by] = [cx + DX[prev], cy + DY[prev]];
    back = DX.findIndex((dx, i) => nx + dx === bx && ny + DY[i] === by);
    [cx, cy] = [nx, ny];
    const isBackAtStart = cx === sx && cy === sy;
    if (isBackAtStart) break;
    contour.push([cx, cy]);
  }
  return contour;
}

function perpendicularDistance(p: Point, a: Point, b: Point) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

// Douglas–Peucker: bỏ các đỉnh nằm gần đường thẳng nối 2 đầu (cạnh thẳng còn 2 đỉnh, cung tròn giữ đủ đỉnh)
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(
      points[i],
      points[0],
      points[points.length - 1],
    );
    if (d > maxDist) [maxDist, index] = [d, i];
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

// Vòng kín: tách tại điểm xa điểm đầu nhất rồi giản lược 2 nửa
function simplifyRing(contour: Point[], tolerance: number): Point[] {
  const first = contour[0];
  const far = contour.reduce(
    (best, p, i) => {
      const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
      return d > best.d ? { d, i } : best;
    },
    { d: 0, i: 0 },
  );
  const half1 = simplify(contour.slice(0, far.i + 1), tolerance);
  const half2 = simplify([...contour.slice(far.i), first], tolerance);
  return [...half1.slice(0, -1), ...half2];
}

export function pointInRing([x, y]: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function bboxInside(inner: BBox, outer: BBox) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

// Vùng bao trọn vùng khác (nền sàn quanh các block) không phải section
function dropContainers(candidates: readonly DetectedShape[]): DetectedShape[] {
  const isContainer = (c: DetectedShape) =>
    candidates.some(
      (o) =>
        o !== c && bboxInside(o.bbox, c.bbox) && pointInRing(o.center, c.ring),
    );
  return candidates.filter((c) => !isContainer(c));
}

function toShape(
  labels: Int32Array,
  w: number,
  h: number,
  r: Region,
  simplifyPx: number,
): DetectedShape {
  const ring = simplifyRing(traceContour(labels, w, h, r), simplifyPx);
  return {
    ring: [...ring, ring[0]],
    bbox: {
      x: r.minX,
      y: r.minY,
      w: r.maxX - r.minX + 1,
      h: r.maxY - r.minY + 1,
    },
    center: [r.sumX / r.area, r.sumY / r.area],
    area: r.area,
  };
}

/** Trả về [{ ring, bbox, center, area }] theo toạ độ pixel */
export function detectSections(
  image: ImageLike,
  options: Partial<DetectOptions> = {},
): DetectedShape[] {
  const opts = { ...DETECT_DEFAULTS, ...options };
  const { width: w, height: h, data } = image;
  const total = w * h;
  const isBright = (i: number) => luminance(data, i) >= opts.minLuminance;
  const { labels, regions } = labelRegions(
    image,
    opts.colorTolerance,
    isBright,
  );
  const candidates = regions
    .filter(
      (r) =>
        r.area >= total * opts.minAreaRatio &&
        r.area <= total * opts.maxAreaRatio,
    )
    .filter((r) => r.minX > 0 && r.minY > 0 && r.maxX < w - 1 && r.maxY < h - 1)
    .filter(
      (r) =>
        r.area / ((r.maxX - r.minX + 1) * (r.maxY - r.minY + 1)) >=
        opts.minFillRatio,
    )
    .filter(
      (r) =>
        r.area / Math.max(r.maxX - r.minX + 1, r.maxY - r.minY + 1) >=
        opts.minThicknessPx,
    )
    .map((r) => toShape(labels, w, h, r, opts.simplifyPx))
    .filter((s) => s.ring.length >= 4);
  return dropContainers(candidates);
}

/** Vùng tối lớn (sân khấu, B-stage...): cùng thuật toán, chỉ đổi điều kiện pixel */
export function detectDarkObjects(
  image: ImageLike,
  options: Partial<DarkObjectOptions> = {},
): DetectedShape[] {
  const opts = { ...DARK_DEFAULTS, ...options };
  const { width: w, height: h, data } = image;
  const isDark = (i: number) =>
    data[i + 3] > 200 && luminance(data, i) <= opts.maxLuminance;
  const { labels, regions } = labelRegions(image, opts.colorTolerance, isDark);
  return regions
    .filter((r) => r.area >= w * h * opts.minAreaRatio)
    .map((r) => toShape(labels, w, h, r, opts.simplifyPx));
}
