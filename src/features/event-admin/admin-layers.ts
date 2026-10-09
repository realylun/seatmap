// Layer phụ của SeatAssignMap, thêm vào style của seatmap sau khi map load:
// tô section theo tier, vùng bấm row, highlight đang chọn, trạng thái held/sold/blocked.
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

export const ADMIN_SOURCES = [
  "admin-tier-sections",
  "admin-sel-sections",
  "admin-sel-rows",
] as const;
export type AdminSource = (typeof ADMIN_SOURCES)[number];

const EMPTY = { type: "FeatureCollection", features: [] } as const;
const SELECTED = "#1f6feb";
const STATUS_COLORS = {
  held: "#f59e0b",
  sold: "#475569",
  blocked: "#9ca3af",
} as const;

const status: ExpressionSpecification = [
  "number",
  ["feature-state", "status"],
  0,
];
const isSelected: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];

const seatOverlayColor: ExpressionSpecification = [
  "case",
  isSelected,
  "rgba(0,0,0,0)",
  ["==", status, 1],
  STATUS_COLORS.held,
  ["==", status, 2],
  STATUS_COLORS.sold,
  ["==", status, 3],
  STATUS_COLORS.blocked,
  "rgba(0,0,0,0)",
];

// blocked: viền đỏ đậm để phân biệt với held/sold (circle không có hatch)
const seatOverlayStroke: ExpressionSpecification = [
  "case",
  isSelected,
  "rgba(0,0,0,0)",
  ["==", status, 3],
  "#b91c1c",
  ["==", status, 0],
  "rgba(0,0,0,0)",
  "#ffffff",
];

export function addAdminLayers(map: MapLibreMap, seatLevel: number) {
  for (const id of ADMIN_SOURCES)
    map.addSource(id, { type: "geojson", data: EMPTY });
  const before = "hovered-section-fill";
  const zoomRamp = (a: number, b: number): ExpressionSpecification => [
    "interpolate",
    ["linear"],
    ["zoom"],
    seatLevel - 0.4,
    a,
    seatLevel,
    b,
  ];
  map.addLayer(
    {
      id: "admin-tier-fill",
      type: "fill",
      source: "admin-tier-sections",
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 },
    },
    "section-stroke",
  );
  map.addLayer(
    {
      id: "rows-hit",
      type: "line",
      source: "rows",
      minzoom: 4,
      paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 12 },
    },
    before,
  );
  map.addLayer(
    {
      id: "seat-status",
      type: "circle",
      source: "seats",
      minzoom: seatLevel - 0.4,
      paint: {
        "circle-color": seatOverlayColor,
        "circle-stroke-color": seatOverlayStroke,
        "circle-stroke-width": 1.5,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          seatLevel - 0.4,
          1,
          8,
          6,
          9,
          12,
        ],
        "circle-opacity": zoomRamp(0, 1),
        "circle-stroke-opacity": zoomRamp(0, 1),
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "admin-sel-sections-fill",
      type: "fill",
      source: "admin-sel-sections",
      paint: { "fill-color": SELECTED, "fill-opacity": 0.35 },
    },
    before,
  );
  map.addLayer(
    {
      id: "admin-sel-sections-line",
      type: "line",
      source: "admin-sel-sections",
      paint: { "line-color": SELECTED, "line-width": 3 },
    },
    before,
  );
  map.addLayer(
    {
      id: "admin-sel-rows-line",
      type: "line",
      source: "admin-sel-rows",
      paint: { "line-color": SELECTED, "line-width": 5, "line-opacity": 0.9 },
    },
    before,
  );
}
