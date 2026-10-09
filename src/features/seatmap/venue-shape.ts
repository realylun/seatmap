// Hình học phụ cho seat map tính từ venue: viền sân (nền trắng như SeatGeek) và khoảng cách ghế
// để vẽ ghế đúng tỉ lệ (bán kính theo toạ độ thật, không cố định pixel).
import type { Point } from "@/domain/venue/types";
import type { FeatureCollection } from "./map-venue";

const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function halfHull(points: readonly Point[]): Point[] {
  const hull: Point[] = [];
  for (const p of points) {
    while (
      hull.length >= 2 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
    ) {
      hull.pop();
    }
    hull.push(p);
  }
  return hull.slice(0, -1);
}

/** Bao lồi (monotone chain), vòng khép kín ngược chiều kim đồng hồ; rỗng nếu < 3 điểm */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return [];
  const hull = [...halfHull(sorted), ...halfHull(sorted.toReversed())];
  return hull.length < 3 ? [] : [...hull, hull[0]];
}

/** Viền sân: bao lồi mọi section, nới ra từ tâm theo tỉ lệ `scale` */
export function outlineRing(
  rings: readonly (readonly Point[])[],
  scale: number,
): Point[] {
  const hull = convexHull(rings.flat());
  if (hull.length === 0) return [];
  const pts = hull.slice(0, -1);
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  return hull.map(([x, y]): Point => [
    cx + (x - cx) * (1 + scale),
    cy + (y - cy) * (1 + scale),
  ]);
}

const isPoint = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");

type SeatProps = { section?: unknown };

function seatsBySection(seats: FeatureCollection): Point[][] {
  const groups = new Map<string, Point[]>();
  for (const f of seats.features) {
    const { section } = f.properties as SeatProps;
    const p = f.geometry.coordinates;
    if (!isPoint(p)) continue;
    const key = String(section);
    const group = groups.get(key);
    // push vào mảng cục bộ: copy mảng mỗi ghế là O(n²) với khu hàng nghìn ghế
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

/** Số ghế mẫu tối đa mỗi khu: trung vị chỉ cần ước lượng, đo hết là O(n²) với khu sân 100k+ ghế */
const MAX_SAMPLES_PER_SECTION = 256;

function nearestDistances(points: readonly Point[]): number[] {
  const stride = Math.max(1, points.length / MAX_SAMPLES_PER_SECTION);
  const samples = Array.from(
    { length: Math.min(points.length, MAX_SAMPLES_PER_SECTION) },
    (_, k) => Math.floor(k * stride),
  );
  return samples.flatMap((i) => {
    const p = points[i];
    const nearest = points.reduce(
      (best, q, j) =>
        j === i ? best : Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1])),
      Infinity,
    );
    return Number.isFinite(nearest) ? [nearest] : [];
  });
}

/**
 * Khoảng cách trung vị từ mỗi ghế tới ghế gần nhất cùng section (đơn vị toạ độ map) — lấy min của
 * khoảng cách ghế và khoảng cách row để ghế không đè nhau; 0 nếu không có ghế. Khu lớn chỉ lấy mẫu
 * (MAX_SAMPLES_PER_SECTION ghế, so với mọi ghế cùng khu).
 */
export function medianSeatSpacing(seats: FeatureCollection): number {
  const gaps = seatsBySection(seats)
    .flatMap(nearestDistances)
    .filter((g) => g > 0)
    .toSorted((a, b) => a - b);
  if (gaps.length === 0) return 0;
  return gaps[Math.floor(gaps.length / 2)];
}

/** Bề rộng thế giới (px) ở zoom 0 của MapLibre (tile 512) trên 360 đơn vị kinh độ */
export const PX_PER_UNIT_Z0 = 512 / 360;

/**
 * Góc chữ trên màn hình cho nhãn dải dài khi map xoay `bearing` độ: `rotate` đo lúc bearing 0,
 * chuẩn hoá về [-90, 90) để chữ không bao giờ lộn ngược. Khớp với `uprightRotate` trong build-style.
 */
export function uprightAngle(rotate: number, bearing: number): number {
  return ((((rotate - bearing + 90) % 180) + 180) % 180) - 90;
}
