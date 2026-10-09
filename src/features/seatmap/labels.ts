// Điểm đặt nhãn tên section (port seatmap-demo/labels.js). Tính 1 lần ở client từ venue,
// không đặt nhãn trên polygon để mỗi section chỉ có đúng 1 nhãn.
import type { Point } from "@/domain/venue/types";
import type { FeatureCollection, MapSection } from "./map-venue";
import { PX_PER_UNIT_Z0, uprightAngle } from "./venue-shape";

/** Section dài/mảnh (dải ghế sát lan can) → chữ xoay theo chiều dài */
const ELONGATED_RATIO = 2.2;

/** Cỡ chữ nhãn (px) theo zoom: [zoom, size, zoom, size, ...], nội suy tuyến tính */
export const LABEL_SIZE_STOPS = [4, 9.5, 5, 13, 7, 24, 9, 48] as const;
/** Các mức zoom xét hiện nhãn; dưới mức đầu (toàn sân) không nhãn nào hiện */
export const LABEL_ZOOM_STEPS = Array.from(
  { length: 21 },
  (_, i) => 4 + i * 0.25,
);
/** Ước lượng bề rộng 1 ký tự / chiều cao dòng so với cỡ chữ (Open Sans) */
const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.2;
const NEVER_ZOOM = 99;
/** Chữ chỉ được chiếm tối đa tỉ lệ này của section để còn lề */
const FILL = 0.9;

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

function labelSize(zoom: number): number {
  const stops = LABEL_SIZE_STOPS;
  if (zoom <= stops[0]) return stops[1];
  for (let i = 2; i < stops.length; i += 2) {
    if (zoom <= stops[i]) {
      const t = (zoom - stops[i - 2]) / (stops[i] - stops[i - 2]);
      return stops[i - 1] + t * (stops[i + 1] - stops[i - 1]);
    }
  }
  return stops[stops.length - 1];
}

/** Hướng chữ trong section: dọc cạnh dài nếu là dải dài, ngược lại nằm ngang */
function labelAxis(ring: readonly Point[]): Vec {
  if (labelRotation(ring) === 0) return [1, 0];
  const [dx, dy] = longestEdge(ring);
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length];
}

/** Zoom nhỏ nhất (trong LABEL_ZOOM_STEPS) mà chữ nằm gọn trong section; Infinity nếu không bao giờ vừa */
export function labelFitZoom(ring: readonly Point[], label: string): number {
  const u = labelAxis(ring);
  const along = extentAlong(ring, u);
  const across = extentAlong(ring, [-u[1], u[0]]);
  const fits = (zoom: number) => {
    const size = labelSize(zoom);
    const scale = PX_PER_UNIT_Z0 * 2 ** zoom * FILL;
    return (
      label.length * size * CHAR_WIDTH <= along * scale &&
      size * LINE_HEIGHT <= across * scale
    );
  };
  return LABEL_ZOOM_STEPS.find(fits) ?? Infinity;
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
      properties: {
        label: s.id,
        rotate: screenRotation(s.ring, bearing),
        // Infinity không đi qua geojson được → mức zoom không bao giờ tới
        minzoom: Math.min(labelFitZoom(s.ring, s.id), NEVER_ZOOM),
      },
      geometry: { type: "Point", coordinates: s.center },
    })),
  };
}
