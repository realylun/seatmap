"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { Listing } from "@/domain/seats/listings";
import { applySelection, applyStateDiff, setSourceData } from "./apply-states";
import type { DecodedAvailability } from "./availability";
import { buildStyle, MAX_ZOOM, MIN_ZOOM, SEAT_LEVEL } from "./build-style";
import { flyHome, flyToSection } from "./camera";
import {
  rowStates,
  seatStates,
  sectionStates,
  type StateMap,
} from "./feature-states";
import { labelFeatures } from "./labels";
import { parseMapVenue, type MapSection, type MapVenue } from "./map-venue";
import { rowMarkers, sectionMarkers, sectionShape } from "./markers";
import { configureMapLibreWorker } from "./maplibre-worker";
import { addPillImages } from "./pills";

configureMapLibreWorker();

const INTERACTIVE_LAYERS = [
  "seats",
  "row-markers",
  "section-markers",
  "section-fill",
];
const MAX_BOUNDS: [number, number, number, number] = [-60, -45, 60, 45];
const EMPTY_STATES: StateMap = new Map();

export type FlyRequest = { readonly section: string; readonly key: number };

export type SeatMapProps = {
  geometryUrl: string;
  availability: DecodedAvailability | null;
  listings: readonly Listing[];
  selection: readonly string[];
  hoveredSection: string | null;
  selectedSection: string | null;
  flyRequest: FlyRequest | null;
  onHoverSection: (section: string | null) => void;
  onSelectSection: (section: string | null) => void;
  onSeatClick: (sid: string) => void;
};

function useMapVenue(geometryUrl: string) {
  const [state, setState] = useState<{
    venue: MapVenue | null;
    error: string | null;
  }>({ venue: null, error: null });
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
        console.error("seat map geometry failed", error);
        setState({ venue: null, error: "Could not load the seat map." });
      });
    return () => controller.abort();
  }, [geometryUrl]);
  return state;
}

function useMapData(
  map: MapLibreMap | null,
  venue: MapVenue | null,
  availability: DecodedAvailability | null,
  listings: readonly Listing[],
) {
  const sectionsById = useMemo(
    () => new Map(venue?.sections.map((s) => [s.id, s]) ?? []),
    [venue],
  );
  const prev = useRef({
    seats: EMPTY_STATES,
    rows: EMPTY_STATES,
    sections: EMPTY_STATES,
  });

  useEffect(() => {
    if (!map || !availability) return;
    const colorById = new Map(availability.tiers.map((t) => [t.id, t.color]));
    const colorOf = (tierId: string) => colorById.get(tierId) ?? "#888888";
    addPillImages(map, [...colorById.values()]);
    setSourceData(
      map,
      "section-markers",
      sectionMarkers(listings, sectionsById, colorOf),
    );
    setSourceData(
      map,
      "row-markers",
      rowMarkers(listings, sectionsById, colorOf),
    );
    const p = prev.current;
    prev.current = {
      seats: applyStateDiff(
        map,
        "seats",
        p.seats,
        seatStates(availability.seats, availability.tierBySid),
        { color: null, status: 0 },
      ),
      rows: applyStateDiff(map, "rows", p.rows, rowStates(listings, colorOf), {
        color: null,
      }),
      sections: applyStateDiff(
        map,
        "sections",
        p.sections,
        sectionStates(listings),
        { listed: false },
      ),
    };
  }, [map, availability, listings, sectionsById]);

  return sectionsById;
}

export default function SeatMap(props: SeatMapProps) {
  const { venue, error } = useMapVenue(props.geometryUrl);
  const mapRef = useRef<MapRef>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [cursor, setCursor] = useState("");
  const sectionsById = useMapData(
    map,
    venue,
    props.availability,
    props.listings,
  );
  const prevSelection = useRef<readonly string[]>([]);

  const style = useMemo(
    () =>
      venue
        ? buildStyle(venue, {
            glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
          })
        : null,
    [venue],
  );

  useEffect(() => {
    if (!map) return;
    applySelection(map, prevSelection.current, props.selection);
    prevSelection.current = props.selection;
  }, [map, props.selection]);

  const { hoveredSection, selectedSection, flyRequest } = props;
  useEffect(() => {
    if (!map) return;
    setSourceData(
      map,
      "hovered-section",
      sectionShape(sectionsById.get(hoveredSection ?? "")),
    );
  }, [map, hoveredSection, sectionsById]);

  useEffect(() => {
    if (!map) return;
    const section = sectionsById.get(selectedSection ?? "");
    setSourceData(map, "selected-section", sectionShape(section));
  }, [map, selectedSection, sectionsById]);

  useEffect(() => {
    const section: MapSection | undefined = sectionsById.get(
      flyRequest?.section ?? "",
    );
    if (!map || !section) return;
    flyToSection(map, section);
  }, [map, flyRequest, sectionsById]);

  if (error) {
    return <MapMessage>{error}</MapMessage>;
  }
  if (!venue || !style) {
    return <MapMessage>Loading seat map…</MapMessage>;
  }

  const onLoad = () => {
    const instance = mapRef.current?.getMap() ?? null;
    if (!instance) return;
    setSourceData(instance, "labels", labelFeatures(venue.sections));
    setMap(instance);
  };

  const onMouseMove = (e: MapLayerMouseEvent) => {
    const section = e.features?.[0]?.properties?.section;
    setCursor(typeof section === "string" ? "pointer" : "");
    props.onHoverSection(typeof section === "string" ? section : null);
  };

  const onClick = (e: MapLayerMouseEvent) => {
    const zoom = e.target.getZoom();
    const seat = e.features?.find((f) => f.layer.id === "seats");
    const sid = seat?.properties?.sid;
    if (zoom >= SEAT_LEVEL && typeof sid === "string") {
      props.onSeatClick(sid);
      return;
    }
    const hit = e.features?.find((f) => f.layer.id !== "seats");
    const section = hit?.properties?.section;
    props.onSelectSection(typeof section === "string" ? section : null);
  };

  return (
    <div className="relative h-full w-full">
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
        renderWorldCopies={false}
        attributionControl={false}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        cursor={cursor}
        onLoad={onLoad}
        onMouseMove={onMouseMove}
        onMouseLeave={() => props.onHoverSection(null)}
        onClick={onClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
      </MapGL>
      <button
        type="button"
        onClick={() => {
          props.onSelectSection(null);
          if (map) flyHome(map, venue.bounds);
        }}
        className="absolute top-24 right-2.5 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold shadow-sm hover:bg-gray-50"
      >
        Full view
      </button>
    </div>
  );
}

function MapMessage({ children }: { children: React.ReactNode }) {
  return (
    <output className="flex h-full w-full items-center justify-center bg-[#eef0f6] text-sm text-muted">
      {children}
    </output>
  );
}
