// Hình học phụ cho seat map tính từ venue: viền sân (nền trắng như SeatGeek), góc nhãn.
// Khoảng cách ghế (bán kính ghế theo toạ độ thật) ở @/domain/venue/seat-spacing.
import type { Point } from "@/domain/venue/types";

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

/** Bề rộng thế giới (px) ở zoom 0 của MapLibre (tile 512) trên 360 đơn vị kinh độ */
export const PX_PER_UNIT_Z0 = 512 / 360;

/**
 * Góc chữ trên màn hình cho nhãn dải dài khi map xoay `bearing` độ: `rotate` đo lúc bearing 0,
 * chuẩn hoá về [-90, 90) để chữ không bao giờ lộn ngược. Khớp với `uprightRotate` trong build-style.
 */
export function uprightAngle(rotate: number, bearing: number): number {
  return ((((rotate - bearing + 90) % 180) + 180) % 180) - 90;
}
