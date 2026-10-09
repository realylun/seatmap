// Điểm đặt nhãn tên section (port seatmap-demo/labels.js). Tính 1 lần ở client từ venue,
// không đặt nhãn trên polygon để mỗi section chỉ có đúng 1 nhãn.
import type { Point } from "@/domain/venue/types";
import type { FeatureCollection, MapSection } from "./map-venue";
import { uprightAngle } from "./venue-shape";

/** Section dài/mảnh (dải ghế sát lan can) → chữ xoay theo chiều dài */
const ELONGATED_RATIO = 2.2;

type Vec = readonly [number, number];

function extentAlong(points: readonly Point[], [ux, uy]: Vec): number {
  const projections = points.map(([x, y]) => x * ux + y * uy);
  return Math.max(...projections) - Math.min(...projections);
}

function longestEdge(ring: readonly Point[]): Vec {
  const edges = ring
    .slice(0, -1)
    .map((p, i): Vec => [ring[i + 1][0] - p[0], ring[i + 1][1] - p[1]]);
  return edges.reduce<Vec>(
    (best, e) => (Math.hypot(...e) > Math.hypot(...best) ? e : best),
    [0, 0],
  );
}

/** Góc chữ (độ, chiều kim đồng hồ trên màn hình); 0 nếu section không đủ dài */
export function labelRotation(ring: readonly Point[]): number {
  const [dx, dy] = longestEdge(ring);
  const length = Math.hypot(dx, dy) || 1;
  const u: Vec = [dx / length, dy / length];
  const along = extentAlong(ring, u);
  const across = extentAlong(ring, [-u[1], u[0]]) || 1;
  if (along / across < ELONGATED_RATIO) return 0;
  // lat hướng lên, màn hình hướng xuống
  const degrees = (-Math.atan2(dy, dx) * 180) / Math.PI;
  if (degrees > 90) return degrees - 180;
  if (degrees < -90) return degrees + 180;
  return degrees;
}

/** Góc chữ trên màn hình khi map xoay `bearing`: section gọn luôn 0, dải dài dọc theo dải */
function screenRotation(ring: readonly Point[], bearing: number): number {
  const rotate = labelRotation(ring);
  return rotate === 0 ? 0 : uprightAngle(rotate, bearing);
}

export function labelFeatures(
  sections: readonly MapSection[],
  bearing = 0,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sections.map((s) => ({
      type: "Feature",
      properties: { label: s.id, rotate: screenRotation(s.ring, bearing) },
      geometry: { type: "Point", coordinates: s.center },
    })),
  };
}
