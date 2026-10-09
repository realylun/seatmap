"use client";

// Bản đồ editor: MapLibre với style tĩnh (editor-style.ts) + cập nhật source bằng setData,
// ảnh sơ đồ là raster image source nằm dưới các section, nhãn section là Marker DOM.
import "maplibre-gl/dist/maplibre-gl.css";
import { configureMapLibreWorker } from "@/features/seatmap/maplibre-worker";
import type {
  GeoJSONSource,
  ImageSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useState, type RefObject } from "react";
import Map, {
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { frontEdgeLine } from "@/domain/venue/geometry";
import type { SectionConfig, Venue } from "@/domain/venue/types";
import type { DrawTool } from "./use-draw-tool";
import { draftGeoJson } from "./draw-tool";
import {
  EDITOR_STYLE,
  FIELD_FILL,
  IMAGE_ID,
  SECTION_FILL,
  SECTION_SELECTED,
  imageLayer,
  imageSource,
  selectedFilter,
  type EditorSourceId,
} from "./editor-style";
import type { EditorState } from "./editor-reducer";

type Props = {
  readonly mapRef: RefObject<MapRef | null>;
  readonly state: EditorState;
  readonly venue: Venue;
  readonly opacity: number;
  readonly draw: DrawTool;
  readonly onSelect: (id: string | null) => void;
};

// Trỏ MapLibre tới worker đã được bundler copy ra (dùng chung với seat map)
configureMapLibreWorker();

const MAX_ZOOM = 10;

type GeoJsonData = Parameters<GeoJSONSource["setData"]>[0];

function setData(map: MapLibreMap, id: EditorSourceId, data: GeoJsonData) {
  void map.getSource<GeoJSONSource>(id)?.setData(data);
}

function frontEdgeData(selected: SectionConfig | undefined) {
  const coordinates = selected
    ? frontEdgeLine(selected.ring, selected.frontEdge)
    : null;
  const features = coordinates
    ? [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        },
      ]
    : [];
  return { type: "FeatureCollection", features };
}

// Ảnh nền: thêm / thay / gỡ image source + raster layer (luôn nằm dưới sân khấu + section).
// Chỉ nạp lại ảnh khi đổi URL — đổi extent / độ mờ chỉ cập nhật toạ độ / paint.
function syncImage(
  map: MapLibreMap,
  image: string | null,
  extent: EditorState["extent"],
  opacity: number,
) {
  const source = map.getSource<ImageSource>(IMAGE_ID);
  if (!image) {
    if (map.getLayer(IMAGE_ID)) map.removeLayer(IMAGE_ID);
    if (source) map.removeSource(IMAGE_ID);
    return;
  }
  const spec = imageSource(image, extent);
  if (!source) {
    map.addSource(IMAGE_ID, spec);
    map.addLayer(imageLayer(), FIELD_FILL);
  } else if (source.url === image) {
    source.setCoordinates(spec.coordinates);
  } else {
    void source.updateImage({ url: image, coordinates: spec.coordinates });
  }
  map.setPaintProperty(IMAGE_ID, "raster-opacity", opacity);
}

export function EditorMap({
  mapRef,
  state,
  venue,
  opacity,
  draw,
  onSelect,
}: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [hovering, setHovering] = useState(false);
  const selected = state.sections.find((s) => s.id === state.selectedId);

  useEffect(() => {
    if (!map) return;
    setData(map, "field", venue.geojson.field);
    setData(map, "sections", venue.geojson.sections);
    setData(map, "rows", venue.geojson.rows);
    setData(map, "seats", venue.geojson.seats);
  }, [map, venue]);

  useEffect(() => {
    if (!map) return;
    map.setFilter(SECTION_SELECTED, selectedFilter(state.selectedId));
    setData(map, "front-edge", frontEdgeData(selected));
  }, [map, state.selectedId, selected]);

  useEffect(() => {
    if (map) setData(map, "draft", draftGeoJson(draw.draft));
  }, [map, draw.draft]);

  useEffect(() => {
    if (map) syncImage(map, state.image, state.extent, opacity);
  }, [map, state.image, state.extent, opacity]);

  const onClick = (event: MapLayerMouseEvent) => {
    if (draw.onClick(event)) return;
    const section: unknown = event.features?.[0]?.properties?.section;
    onSelect(typeof section === "string" ? section : null);
  };

  const { w, h } = state.extent;
  return (
    <Map
      ref={mapRef}
      mapStyle={EDITOR_STYLE}
      initialViewState={{
        bounds: [-w, -h, w, h],
        fitBoundsOptions: { padding: 40 },
      }}
      renderWorldCopies={false}
      dragRotate={false}
      touchPitch={false}
      doubleClickZoom={!draw.active}
      maxZoom={MAX_ZOOM}
      interactiveLayerIds={[SECTION_FILL]}
      cursor={draw.active ? "crosshair" : hovering ? "pointer" : ""}
      onLoad={(event) => setMap(event.target)}
      onClick={onClick}
      onMouseMove={draw.onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl showCompass={false} />
      {venue.sections.map((s) => (
        <Marker
          key={s.id}
          longitude={s.center[0]}
          latitude={s.center[1]}
          style={{ pointerEvents: "none" }}
        >
          <span className="rounded-sm bg-white/80 px-1 text-[11px] font-semibold text-[#1d3f7a]">
            {s.id}
          </span>
        </Marker>
      ))}
    </Map>
  );
}
