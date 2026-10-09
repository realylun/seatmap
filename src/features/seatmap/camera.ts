// Camera kiểu SeatGeek (port seatmap-demo/camera.js):
// - "toàn sân": vừa khung venue, phẳng (2D) hoặc nghiêng + xoay (3D) theo chế độ đang chọn
// - chọn section: bay tới section, nghiêng 3D và xoay để tâm sân nằm phía trên màn hình (góc nhìn từ ghế)
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Point } from "@/domain/venue/types";
import type { MapSection } from "./map-venue";

export const MAX_PITCH = 60;
/** Người dùng tự kéo nghiêng quá mức này = đang ở 3D */
export const TILT_THRESHOLD = 5;
const PITCH_3D = 50;
const BEARING_3D = -30;
const SEAT_VIEW_PITCH = 45;
const SEAT_VIEW_MIN_ZOOM = 6.6; // > SEAT_LEVEL → thấy từng ghế
const SEAT_VIEW_MAX_ZOOM = 7.2;
const PADDING = 40;
const DURATION = 900;

type Bounds = readonly [Point, Point];

export function boundsCenter([[w, s], [e, n]]: Bounds): Point {
  return [(w + e) / 2, (s + n) / 2];
}

export function ringBounds(ring: readonly Point[]): [Point, Point] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/** Bearing (độ, chiều kim đồng hồ từ Bắc) để điểm `to` nằm phía trên màn hình khi đứng ở `from` */
export function bearingToward(from: Point, to: Point): number {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function flyHome(map: MapLibreMap, bounds: Bounds, is3d: boolean) {
  // Đo khung khi chưa xoay: khung xoay của bounds vuông lớn hơn sân thật nên sân bị thu nhỏ quá mức
  const fit = map.cameraForBounds([bounds[0], bounds[1]], { padding: PADDING });
  const zoom = (fit?.zoom ?? map.getZoom()) + (is3d ? 0.1 : 0);
  map.easeTo({
    center: boundsCenter(bounds),
    zoom,
    pitch: is3d ? PITCH_3D : 0,
    bearing: is3d ? BEARING_3D : 0,
    duration: DURATION,
  });
}

/** Bay tới section, nghiêng 3D, xoay để `focus` (tâm sân / sân khấu) nằm phía trên màn hình */
export function flyToSection(
  map: MapLibreMap,
  section: MapSection,
  focus: Point,
) {
  const bearing = bearingToward(section.center, focus);
  const fit = map.cameraForBounds(ringBounds(section.ring), {
    padding: PADDING * 2,
    bearing,
  });
  const zoom = Math.min(
    SEAT_VIEW_MAX_ZOOM,
    Math.max(fit?.zoom ?? SEAT_VIEW_MIN_ZOOM, SEAT_VIEW_MIN_ZOOM),
  );
  map.easeTo({
    center: section.center,
    zoom,
    bearing,
    pitch: SEAT_VIEW_PITCH,
    duration: DURATION,
  });
}
