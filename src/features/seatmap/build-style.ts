// Style spec v8 cho seat map (port seatmap-demo/style.js sang MapLibre, chỉ chế độ geojson).
// 3 tầng zoom: section + pin giá theo section (< SWITCH_LEVEL) → row + pin theo row → từng ghế (≥ SEAT_LEVEL).
// Màu/trạng thái động đi qua feature-state (promoteId) nên style chỉ build 1 lần cho mỗi venue.
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { MapVenue } from "./map-venue";

export const SWITCH_LEVEL = 5;
export const SEAT_LEVEL = 6.2;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 9;

export const COLORS = {
  background: "#eef0f6",
  sectionListed: "#e0e1e7",
  sectionEmpty: "#eaeaee",
  sectionStroke: "#b4b6c1",
  rowDefault: "#cfd1da",
  seatEmpty: "#ffffff",
  seatStroke: "#c9cbd4",
  seatTaken: "#b9bcc6",
  // ghế đang chọn: nền đậm + viền accent, không trùng màu tier nào
  seatSelected: "#14090a",
  seatSelectedStroke: "#ff5a3c",
  selected: "#1f6feb",
  hover: "#5b6475",
  label: "#7c7e8a",
  pillText: "#16171a",
} as const;

const FONT_REGULAR = ["Open Sans Regular"];
const FONT_BOLD = ["Open Sans Bold"];
const EMPTY = { type: "FeatureCollection", features: [] } as const;

/** promoteId cho setFeatureState theo section / row / ghế */
export const PROMOTE = { sections: "section", rows: "rid", seats: "sid" };

/** Nguồn động, app gọi setData khi có availability / hover / chọn */
export const DYNAMIC_SOURCES = [
  "section-markers",
  "row-markers",
  "hovered-section",
  "selected-section",
  "labels",
] as const;

export type DynamicSource = (typeof DYNAMIC_SOURCES)[number];

const byZoom = (
  ...stops: (number | ExpressionSpecification)[]
): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], ...stops];

const stateColor = ["feature-state", "color"] as ExpressionSpecification;
const isListed: ExpressionSpecification = ["!=", stateColor, null];
const isSelected: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];
const isTaken: ExpressionSpecification = [
  ">",
  ["number", ["feature-state", "status"], 0],
  0,
];

const seatColor = (
  fallback: string,
  selected: string = COLORS.seatSelected,
): ExpressionSpecification => [
  "case",
  isSelected,
  selected,
  isTaken,
  COLORS.seatTaken,
  ["to-color", ["coalesce", stateColor, fallback]],
];

function venueLayers(): LayerSpecification[] {
  return [
    {
      id: "section-fill",
      type: "fill",
      source: "sections",
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "listed"], false],
          COLORS.sectionListed,
          COLORS.sectionEmpty,
        ],
      },
    },
    {
      id: "section-stroke",
      type: "line",
      source: "sections",
      paint: {
        "line-color": COLORS.sectionStroke,
        "line-width": byZoom(4, 0.6, 8, 1.6),
      },
    },
    // Row có vé: vạch màu tier khi nhìn toàn sân; tới zoom ghế thì nhường cho từng ghế
    {
      id: "row-stroke",
      type: "line",
      source: "rows",
      minzoom: 4,
      paint: {
        "line-color": ["to-color", ["coalesce", stateColor, COLORS.rowDefault]],
        "line-width": byZoom(4, ["case", isListed, 1.6, 0.5], 6, [
          "case",
          isListed,
          4,
          0.5,
        ]),
        "line-opacity": byZoom(5, ["case", isListed, 1, 0], SEAT_LEVEL, [
          "case",
          isListed,
          0,
          0.7,
        ]),
      },
    },
    {
      id: "seats",
      type: "circle",
      source: "seats",
      minzoom: SEAT_LEVEL - 0.4,
      paint: {
        "circle-color": seatColor(COLORS.seatEmpty),
        "circle-stroke-color": seatColor(
          COLORS.seatStroke,
          COLORS.seatSelectedStroke,
        ),
        "circle-stroke-width": ["case", isSelected, 2.5, 1],
        "circle-radius": byZoom(SEAT_LEVEL - 0.4, 1, 8, 6, 9, 12),
        "circle-opacity": byZoom(SEAT_LEVEL - 0.4, 0, SEAT_LEVEL, 1),
        "circle-stroke-opacity": byZoom(SEAT_LEVEL - 0.4, 0, SEAT_LEVEL, 1),
      },
    },
  ];
}

function sectionLabelLayer(
  id: string,
  filter: ExpressionSpecification,
  rotationAlignment: "viewport" | "map",
): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source: "labels",
    filter,
    layout: {
      "text-field": ["get", "label"],
      "text-font": FONT_REGULAR,
      "text-size": byZoom(4, 9.5, 5, 13, 7, 24, 9, 48),
      "text-padding": 0,
      "text-rotate": ["get", "rotate"],
      "text-rotation-alignment": rotationAlignment,
      "text-pitch-alignment": "map",
      // luôn hiện, nằm dưới viên giá, không đẩy viên giá đi
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": COLORS.label,
      "text-halo-color": "#ffffff",
      "text-halo-width": 0.5,
    },
  };
}

// Viên giá: ảnh "pill-<màu>" (pills.ts) co theo chữ; giá rẻ được ưu tiên khi đè nhau
function pillLayer(
  id: DynamicSource,
  textSize: number,
  zoomRange: { minzoom?: number; maxzoom?: number },
): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source: id,
    ...zoomRange,
    layout: {
      "icon-image": ["concat", "pill-", ["get", "colorKey"]],
      "icon-text-fit": "both",
      "icon-text-fit-padding": [1, 2, 1, 2],
      "text-field": ["get", "label"],
      "text-font": FONT_BOLD,
      "text-size": textSize,
      "text-anchor": "bottom",
      "text-offset": [0, -0.5],
      "symbol-sort-key": ["get", "price"],
      "text-padding": 3,
    },
    paint: { "text-color": COLORS.pillText },
  };
}

export function buildStyle(
  venue: MapVenue,
  { glyphs }: { glyphs: string },
): StyleSpecification {
  const { geojson } = venue;
  const dynamic = Object.fromEntries(
    DYNAMIC_SOURCES.map((id) => [id, { type: "geojson", data: EMPTY }]),
  );
  return {
    version: 8,
    glyphs,
    sources: {
      field: { type: "geojson", data: geojson.field },
      sections: {
        type: "geojson",
        data: geojson.sections,
        promoteId: PROMOTE.sections,
      },
      rows: { type: "geojson", data: geojson.rows, promoteId: PROMOTE.rows },
      seats: { type: "geojson", data: geojson.seats, promoteId: PROMOTE.seats },
      ...dynamic,
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": COLORS.background },
      },
      {
        id: "field",
        type: "fill",
        source: "field",
        paint: { "fill-color": "#7cb46b" },
      },
      ...venueLayers(),
      {
        id: "hovered-section-fill",
        type: "fill",
        source: "hovered-section",
        paint: { "fill-color": COLORS.hover, "fill-opacity": 0.25 },
      },
      {
        id: "selected-section-stroke",
        type: "line",
        source: "selected-section",
        paint: { "line-color": COLORS.selected, "line-width": 3 },
      },
      sectionLabelLayer(
        "section-labels",
        ["==", ["get", "rotate"], 0],
        "viewport",
      ),
      sectionLabelLayer(
        "section-labels-along",
        ["!=", ["get", "rotate"], 0],
        "map",
      ),
      pillLayer("section-markers", 13, { maxzoom: SWITCH_LEVEL }),
      // tới zoom ghế thì ẩn pin row để thấy và bấm được từng ghế
      pillLayer("row-markers", 11, {
        minzoom: SWITCH_LEVEL,
        maxzoom: SEAT_LEVEL,
      }),
    ],
  };
}
