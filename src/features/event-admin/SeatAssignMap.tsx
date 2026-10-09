"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { configureMapLibreWorker } from "@/features/seatmap/maplibre-worker";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import {
  applySelection,
  applyStateDiff,
  setSourceData,
} from "@/features/seatmap/apply-states";
import type { DecodedAvailability } from "@/features/seatmap/availability";
import {
  buildStyle,
  MAX_ZOOM,
  MIN_ZOOM,
  SEAT_LEVEL,
} from "@/features/seatmap/build-style";
import type { StateMap } from "@/features/seatmap/feature-states";
import { seatStates } from "@/features/seatmap/feature-states";
import { labelFeatures } from "@/features/seatmap/labels";
import {
  parseMapVenue,
  type FeatureCollection,
  type MapVenue,
} from "@/features/seatmap/map-venue";
import {
  dominantColors,
  fullySelected,
  levelForZoom,
  type Pick,
  type SeatIndex,
} from "./assign-selection";
import { addAdminLayers, type AdminSource } from "./admin-layers";

configureMapLibreWorker();

const MAX_BOUNDS: [number, number, number, number] = [-60, -45, 60, 45];
const INTERACTIVE_LAYERS = ["seats", "rows-hit", "section-fill"];
const EMPTY_STATES: StateMap = new Map();

export type SeatAssignMapProps = {
  geometryUrl: string;
  availability: DecodedAvailability | null;
  index: SeatIndex;
  selection: ReadonlySet<string>;
  onPick: (pick: Pick, additive: boolean) => void;
};

function useVenue(geometryUrl: string) {
  const [state, setState] = useState<{
    venue: MapVenue | null;
    error: string | null;
  }>({
    venue: null,
    error: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    fetch(geometryUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: unknown) =>
        setState({ venue: parseMapVenue(json), error: null }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("assign map geometry failed", error);
        setState({ venue: null, error: "Could not load the seat map." });
      });
    return () => controller.abort();
  }, [geometryUrl]);
  return state;
}

function setAdminData(
  map: MapLibreMap,
  id: AdminSource,
  data: FeatureCollection,
) {
  void map.getSource<GeoJSONSource>(id)?.setData(data);
}

const collection = (
  features: FeatureCollection["features"],
): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

/** Tier colors on rows + sections, seat states, from availability. */
function useTierPaint(
  map: MapLibreMap | null,
  venue: MapVenue | null,
  availability: DecodedAvailability | null,
  index: SeatIndex,
) {
  const prev = useRef({ seats: EMPTY_STATES, rows: EMPTY_STATES });
  useEffect(() => {
    if (!map || !venue || !availability) return;
    const colorOf = (sid: string) =>
      availability.tierBySid.get(sid)?.color ?? null;
    const rowColors = dominantColors(index.byRow, colorOf);
    const sectionColors = dominantColors(index.bySection, colorOf);
    prev.current = {
      seats: applyStateDiff(
        map,
        "seats",
        prev.current.seats,
        seatStates(availability.seats, availability.tierBySid),
        { color: null, status: 0 },
      ),
      rows: applyStateDiff(
        map,
        "rows",
        prev.current.rows,
        new Map([...rowColors].map(([rid, color]) => [rid, { color }])),
        { color: null },
      ),
    };
    setAdminData(
      map,
      "admin-tier-sections",
      collection(
        venue.geojson.sections.features.flatMap((f) => {
          const color = sectionColors.get(String(f.properties.section));
          return color
            ? [{ ...f, properties: { ...f.properties, color } }]
            : [];
        }),
      ),
    );
  }, [map, venue, availability, index]);
}

function useSelectionPaint(
  map: MapLibreMap | null,
  venue: MapVenue | null,
  index: SeatIndex,
  selection: ReadonlySet<string>,
) {
  const prev = useRef<readonly string[]>([]);
  useEffect(() => {
    if (!map || !venue) return;
    const next = [...selection];
    applySelection(map, prev.current, next);
    prev.current = next;
    const sections = new Set(fullySelected(index.bySection, selection));
    const rows = new Set(fullySelected(index.byRow, selection));
    setAdminData(
      map,
      "admin-sel-sections",
      collection(
        venue.geojson.sections.features.filter((f) =>
          sections.has(String(f.properties.section)),
        ),
      ),
    );
    setAdminData(
      map,
      "admin-sel-rows",
      collection(
        venue.geojson.rows.features.filter((f) =>
          rows.has(String(f.properties.rid)),
        ),
      ),
    );
  }, [map, venue, index, selection]);
}

function hitToPick(e: MapLayerMouseEvent): Pick | null {
  const level = levelForZoom(e.target.getZoom());
  const features = e.features ?? [];
  if (level === "seat") {
    const sid = features.find((f) => f.layer.id === "seats")?.properties?.sid;
    return typeof sid === "string" ? { level, sid } : null;
  }
  if (level === "row") {
    const p = features.find((f) => f.layer.id === "rows-hit")?.properties;
    if (p && typeof p.section === "string" && typeof p.row === "string") {
      return { level, section: p.section, row: p.row };
    }
    return null;
  }
  const section = features.find((f) => f.layer.id === "section-fill")
    ?.properties?.section;
  return typeof section === "string" ? { level, section } : null;
}

export default function SeatAssignMap(props: SeatAssignMapProps) {
  const { venue, error } = useVenue(props.geometryUrl);
  const mapRef = useRef<MapRef>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [cursor, setCursor] = useState("");
  const style = useMemo(
    () =>
      venue
        ? buildStyle(venue, {
            glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
          })
        : null,
    [venue],
  );
  useTierPaint(map, venue, props.availability, props.index);
  useSelectionPaint(map, venue, props.index, props.selection);

  if (error) return <MapMessage>{error}</MapMessage>;
  if (!venue || !style) return <MapMessage>Loading seat map…</MapMessage>;

  const onLoad = () => {
    const instance = mapRef.current?.getMap() ?? null;
    if (!instance) return;
    addAdminLayers(instance, SEAT_LEVEL);
    setSourceData(instance, "labels", labelFeatures(venue.sections));
    setMap(instance);
  };

  return (
    <MapGL
      ref={mapRef}
      mapStyle={style}
      initialViewState={{
        bounds: [venue.bounds[0], venue.bounds[1]],
        fitBoundsOptions: { padding: 24 },
      }}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxBounds={MAX_BOUNDS}
      maxPitch={0}
      dragRotate={false}
      boxZoom={false}
      renderWorldCopies={false}
      attributionControl={false}
      interactiveLayerIds={INTERACTIVE_LAYERS}
      cursor={cursor}
      onLoad={onLoad}
      onMouseMove={(e) => setCursor(hitToPick(e) ? "pointer" : "")}
      onClick={(e) => {
        const pick = hitToPick(e);
        if (pick) props.onPick(pick, e.originalEvent.shiftKey);
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />
    </MapGL>
  );
}

function MapMessage({ children }: { children: React.ReactNode }) {
  return (
    <output className="flex h-full w-full items-center justify-center bg-[#eef0f6] text-sm text-zinc-500">
      {children}
    </output>
  );
}
