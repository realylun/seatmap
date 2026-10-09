// Style spec v8 cho seat map (port seatmap-demo/style.js sang MapLibre, chỉ chế độ geojson).
// 3 tầng zoom: section + pin giá theo section (< SWITCH_LEVEL) → row + pin theo row → từng ghế (≥ SEAT_LEVEL).
// Màu/trạng thái động đi qua feature-state (promoteId) nên style chỉ build 1 lần cho mỗi venue.
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { LABEL_SIZE_STOPS, LABEL_ZOOM_STEPS } from "./labels";
import type { MapVenue } from "./map-venue";
import { PX_PER_UNIT_Z0 } from "./venue-shape";

export const SWITCH_LEVEL = 5;
export const SEAT_LEVEL = 6.2;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 9;

export const COLORS = {
  background: "#eef0f6",
  // viền sân: nền trắng + mép tím nhạt như SeatGeek
  outline: "#ffffff",
  outlineStroke: "#c9c8dc",
  // sân khấu (geojson.field kind=stage) xám đậm như ảnh gốc; field khác giữ màu cỏ
  stage: "#4d4d4d",
  stageStroke: "#2e2e2e",
  field: "#7cb46b",
  sectionListed: "#e0e1e7",
  sectionEmpty: "#eaeaee",
  sectionStroke: "#b4b6c1",
  rowDefault: "#cfd1da",
  seatEmpty: "#f4f4f7",
  seatStroke: "#c9cbd4",
  seatTaken: "#c4c6cf",
  // ghế đang chọn: nền đậm + viền accent, không trùng màu tier nào
  seatSelected: "#14090a",
  seatSelectedStroke: "#ff5a3c",
  selected: "#1f6feb",
  hover: "#5b6475",
  label: "#7c7e8a",
  pillText: "#16171a",
  seatNumber: "#ffffff",
} as const;

/** Bán kính ghế / khoảng cách 2 ghế: < 0.5 để còn khe trắng giữa các ghế */
const SEAT_RADIUS_RATIO = 0.42;

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

/**
 * Bán kính ghế (px) theo khoảng cách ghế thật: px/đơn vị tăng gấp đôi mỗi bậc zoom → nội suy
 * exponential cơ số 2 cho ghế luôn đúng tỉ lệ với section ở mọi zoom.
 */
export function seatRadius(spacing: number): ExpressionSpecification {
  if (spacing <= 0) return byZoom(SEAT_LEVEL - 0.4, 1, 8, 6, 9, 12);
  const at = (zoom: number) =>
    spacing * SEAT_RADIUS_RATIO * PX_PER_UNIT_Z0 * 2 ** zoom;
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    SEAT_LEVEL - 0.4,
    at(SEAT_LEVEL - 0.4),
    MAX_ZOOM,
    at(MAX_ZOOM),
  ];
}

const fadeInSeats = (
  visible: number | ExpressionSpecification,
): ExpressionSpecification => byZoom(SEAT_LEVEL - 0.4, 0, SEAT_LEVEL, visible);

function sectionLayers(): LayerSpecification[] {
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
  ];
}

// Row + ghế nằm trên lớp phủ hover/chọn section để tint không làm đục màu ghế
function seatLayers(spacing: number): LayerSpecification[] {
  return [
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
        // ghế trống không viền (như SeatGeek); ghế có vé viền đậm màu tier
        "circle-stroke-width": [
          "case",
          isSelected,
          2.5,
          ["all", isListed, ["!", isTaken]],
          1.5,
          0,
        ],
        "circle-radius": seatRadius(spacing),
        // ghế nằm phẳng trên mặt sân → khi nghiêng 3D bị nén theo phối cảnh, không đè row bên cạnh
        "circle-pitch-alignment": "map",
        // ghế có vé: nền nhạt hơn viền một chút
        "circle-opacity": fadeInSeats([
          "case",
          ["all", isListed, ["!", isSelected], ["!", isTaken]],
          0.72,
          1,
        ]),
        "circle-stroke-opacity": fadeInSeats(1),
      },
    },
    // Số ghế chỉ hiện trên ghế đang chọn (feature-state không dùng được trong filter → ẩn bằng opacity)
    {
      id: "seat-numbers",
      type: "symbol",
      source: "seats",
      minzoom: SEAT_LEVEL,
      layout: {
        "text-field": ["to-string", ["get", "seat"]],
        "text-font": FONT_REGULAR,
        "text-size": byZoom(SEAT_LEVEL, 9, MAX_ZOOM, 22),
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-pitch-alignment": "viewport",
      },
      paint: {
        "text-color": COLORS.seatNumber,
        "text-opacity": ["case", isSelected, 1, 0],
      },
    },
  ];
}

/** Nhãn chỉ hiện từ zoom mà chữ vừa section (properties.minzoom, labels.ts) */
const labelOpacity: ExpressionSpecification = [
  "step",
  ["zoom"],
  0,
  ...LABEL_ZOOM_STEPS.flatMap((zoom) => [
    zoom,
    ["case", ["<=", ["get", "minzoom"], zoom], 1, 0] as ExpressionSpecification,
  ]),
] as ExpressionSpecification;

// Nhãn luôn theo màn hình: dải dài đã được tính sẵn góc dọc theo dải và giữ không lộn ngược
// theo bearing hiện tại (labels.ts), nên xoay sân 3D chữ vẫn đọc được
function sectionLabelLayer(): SymbolLayerSpecification {
  return {
    id: "section-labels",
    type: "symbol",
    source: "labels",
    layout: {
      "text-field": ["get", "label"],
      "text-font": FONT_REGULAR,
      "text-size": byZoom(...LABEL_SIZE_STOPS),
      "text-padding": 0,
      "text-rotate": ["get", "rotate"],
      "text-rotation-alignment": "viewport",
      "text-pitch-alignment": "map",
      // nằm dưới viên giá, không đẩy viên giá đi; ẩn/hiện bằng text-opacity
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": COLORS.label,
      "text-opacity": labelOpacity,
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
      outline: { type: "geojson", data: geojson.outline },
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
        id: "outline-fill",
        type: "fill",
        source: "outline",
        paint: { "fill-color": COLORS.outline },
      },
      {
        id: "outline-stroke",
        type: "line",
        source: "outline",
        layout: { "line-join": "round" },
        paint: {
          "line-color": COLORS.outlineStroke,
          "line-width": byZoom(4, 2, 8, 6),
        },
      },
      // Trên viền sân trắng, dưới section / ghế / nhãn / viên giá
      {
        id: "field",
        type: "fill",
        source: "field",
        paint: {
          "fill-color": [
            "match",
            ["get", "kind"],
            "stage",
            COLORS.stage,
            COLORS.field,
          ],
        },
      },
      {
        id: "field-stroke",
        type: "line",
        source: "field",
        filter: ["==", ["get", "kind"], "stage"],
        layout: { "line-join": "round" },
        paint: {
          "line-color": COLORS.stageStroke,
          "line-width": byZoom(4, 0.8, 8, 2),
        },
      },
      ...sectionLayers(),
      {
        id: "hovered-section-fill",
        type: "fill",
        source: "hovered-section",
        paint: { "fill-color": COLORS.hover, "fill-opacity": 0.18 },
      },
      // Section đang chọn: phủ nhạt màu tier của vé rẻ nhất (như SeatGeek), nằm dưới ghế
      {
        id: "selected-section-fill",
        type: "fill",
        source: "selected-section",
        paint: {
          "fill-color": [
            "to-color",
            ["coalesce", ["get", "color"], COLORS.selected],
          ],
          "fill-opacity": 0.2,
        },
      },
      {
        id: "selected-section-stroke",
        type: "line",
        source: "selected-section",
        paint: {
          "line-color": [
            "to-color",
            ["coalesce", ["get", "color"], COLORS.selected],
          ],
          "line-width": 2,
          "line-opacity": 0.8,
        },
      },
      ...seatLayers(venue.seatSpacing),
      sectionLabelLayer(),
      pillLayer("section-markers", 13, { maxzoom: SWITCH_LEVEL }),
      // pin row cắm ở đầu row, vẫn hiện ở zoom ghế (click ưu tiên ghế bên dưới, xem SeatMap onClick)
      pillLayer("row-markers", 11, { minzoom: SWITCH_LEVEL }),
    ],
  };
}
