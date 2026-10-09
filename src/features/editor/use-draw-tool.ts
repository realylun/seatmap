"use client";

// Chế độ vẽ polygon trên MapLibre (port draw.js) — logic thuần ở draw-tool.ts.
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import { useCallback, useEffect, useState, type RefObject } from "react";
import type { Point } from "@/domain/venue/types";
import {
  addVertex,
  closeRing,
  EMPTY_DRAFT,
  handleDrawKey,
  isNearFirst,
  moveCursor,
  type DrawDraft,
} from "./draw-tool";

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export type DrawTool = {
  readonly active: boolean;
  readonly draft: DrawDraft;
  readonly setActive: (active: boolean) => void;
  /** true nếu click đã được chế độ vẽ xử lý */
  readonly onClick: (event: MapLayerMouseEvent) => boolean;
  readonly onMove: (event: MapLayerMouseEvent) => void;
};

const toPoint = (event: MapLayerMouseEvent): Point => [
  event.lngLat.lng,
  event.lngLat.lat,
];

export function useDrawTool(
  mapRef: RefObject<MapRef | null>,
  onFinish: (ring: Point[]) => void,
): DrawTool {
  const [active, setActiveState] = useState(false);
  const [draft, setDraft] = useState<DrawDraft>(EMPTY_DRAFT);

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    setDraft(EMPTY_DRAFT);
  }, []);

  const finish = useCallback(
    (current: DrawDraft) => {
      const ring = closeRing(current);
      if (!ring) return;
      setDraft(EMPTY_DRAFT);
      onFinish(ring);
    },
    [onFinish],
  );

  const onClick = (event: MapLayerMouseEvent) => {
    if (!active) return false;
    const first = draft.vertices[0];
    const map = mapRef.current;
    if (first && map && isNearFirst(draft, event.point, map.project(first)))
      finish(draft);
    else setDraft(addVertex(draft, toPoint(event)));
    return true;
  };

  const onMove = (event: MapLayerMouseEvent) => {
    if (active) setDraft((d) => moveCursor(d, toPoint(event)));
  };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (TYPING_TAGS.has(tag)) return;
      const result = handleDrawKey(draft, event.key);
      if (!result) return;
      if (result.ring) finish(draft);
      else setDraft(result.draft);
      if (result.exit) setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, draft, finish, setActive]);

  return { active, draft, setActive, onClick, onMove };
}
