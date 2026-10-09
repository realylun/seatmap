// Style MapLibre của editor (port layer của seatmap-editor/app.js). Style tĩnh, các source geojson
// ban đầu rỗng — EditorMap gọi setData / setFilter khi state đổi (giống bản gốc), tránh để MapLibre
// diff cả style (10k ghế) mỗi lần di chuột khi vẽ. Không có symbol layer → không cần glyphs.
import type {
  FilterSpecification,
  ImageSourceSpecification,
  RasterLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { Extent } from "@/domain/venue/types";
import { imageCorners } from "@/domain/venue/projection";

export const COLORS = {
  background: "#eceae5",
  section: "#4f7cc4",
  selected: "#1f6feb",
  ink: "#1d3f7a",
  accent: "#e5383b",
  // sân khấu: cùng màu với seat map công khai (build-style.ts)
  stage: "#4d4d4d",
  stageStroke: "#2e2e2e",
} as const;

export const GEOJSON_SOURCES = [
  "field",
  "sections",
  "rows",
  "seats",
  "front-edge",
  "draft",
] as const;
export type EditorSourceId = (typeof GEOJSON_SOURCES)[number];

export const FIELD_FILL = "field-fill";
export const SECTION_FILL = "section-fill";
export const SECTION_SELECTED = "section-selected";
export const IMAGE_ID = "image";

const EMPTY = { type: "FeatureCollection", features: [] } as const;

export const selectedFilter = (
  selectedId: string | null,
): FilterSpecification => ["==", ["get", "section"], selectedId ?? ""];

export const EDITOR_STYLE: StyleSpecification = {
  version: 8,
  sources: Object.fromEntries(
    GEOJSON_SOURCES.map((id) => [id, { type: "geojson", data: EMPTY }]),
  ),
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": COLORS.background },
    },
    // Sân khấu sẽ được export (geojson.field) — nằm trên ảnh nền, dưới section
    {
      id: FIELD_FILL,
      type: "fill",
      source: "field",
      paint: { "fill-color": COLORS.stage, "fill-opacity": 0.85 },
    },
    {
      id: "field-stroke",
      type: "line",
      source: "field",
      paint: { "line-color": COLORS.stageStroke, "line-width": 1.5 },
    },
    {
      id: SECTION_FILL,
      type: "fill",
      source: "sections",
      paint: { "fill-color": COLORS.section, "fill-opacity": 0.25 },
    },
    {
      id: SECTION_SELECTED,
      type: "fill",
      source: "sections",
      filter: selectedFilter(null),
      paint: { "fill-color": COLORS.selected, "fill-opacity": 0.35 },
    },
    {
      id: "section-outline",
      type: "line",
      source: "sections",
      paint: { "line-color": COLORS.ink, "line-width": 1.5 },
    },
    {
      id: "rows",
      type: "line",
      source: "rows",
      paint: {
        "line-color": COLORS.ink,
        "line-width": 0.6,
        "line-opacity": 0.6,
      },
    },
    {
      id: "seats",
      type: "circle",
      source: "seats",
      paint: {
        "circle-color": COLORS.ink,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1, 8, 5],
      },
    },
    {
      id: "front-edge",
      type: "line",
      source: "front-edge",
      paint: { "line-color": COLORS.accent, "line-width": 4 },
    },
    {
      id: "draft-line",
      type: "line",
      source: "draft",
      paint: {
        "line-color": COLORS.accent,
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    },
    {
      id: "draft-points",
      type: "circle",
      source: "draft",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#fff",
        "circle-radius": 4,
        "circle-stroke-color": COLORS.accent,
        "circle-stroke-width": 2,
      },
    },
  ],
};

/** Ảnh sơ đồ phủ đúng khung extent, nằm dưới các section */
export function imageSource(
  url: string,
  extent: Extent,
): ImageSourceSpecification {
  return { type: "image", url, coordinates: imageCorners(extent) };
}

export function imageLayer(): RasterLayerSpecification {
  return { id: IMAGE_ID, type: "raster", source: IMAGE_ID };
}
