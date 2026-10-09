// Camera (port seatmap-demo/camera.js, chỉ 2D, luôn hướng Bắc): "toàn sân" vừa khung venue;
// chọn section → bay tới section ở zoom thấy từng ghế.
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Point } from "@/domain/venue/types";
import type { MapSection } from "./map-venue";

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

export function flyHome(map: MapLibreMap, bounds: Bounds) {
  const fit = map.cameraForBounds([bounds[0], bounds[1]], { padding: PADDING });
  map.easeTo({
    center: boundsCenter(bounds),
    zoom: fit?.zoom ?? map.getZoom(),
    bearing: 0,
    pitch: 0,
    duration: DURATION,
  });
}

/** Bay tới section, giữ hướng Bắc (bearing 0) để nhãn không bao giờ bị lộn ngược */
export function flyToSection(map: MapLibreMap, section: MapSection) {
  const fit = map.cameraForBounds(ringBounds(section.ring), {
    padding: PADDING * 2,
  });
  const zoom = Math.min(
    SEAT_VIEW_MAX_ZOOM,
    Math.max(fit?.zoom ?? SEAT_VIEW_MIN_ZOOM, SEAT_VIEW_MIN_ZOOM),
  );
  map.easeTo({
    center: section.center,
    zoom,
    bearing: 0,
    pitch: 0,
    duration: DURATION,
  });
}
