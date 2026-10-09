// Logic vẽ polygon (port draw.js) tách khỏi map: click thêm đỉnh, click lại đỉnh đầu / Enter để khép,
// Backspace xoá đỉnh cuối, Esc huỷ bản nháp (lần 2 thoát chế độ vẽ).
import type { Point } from "@/domain/venue/types";

export const SNAP_PX = 10;
export const MIN_VERTICES = 3;

export type DrawDraft = {
  readonly vertices: readonly Point[];
  readonly cursor: Point | null;
};

export const EMPTY_DRAFT: DrawDraft = { vertices: [], cursor: null };

export const addVertex = (draft: DrawDraft, p: Point): DrawDraft => ({
  ...draft,
  vertices: [...draft.vertices, p],
});

export const moveCursor = (draft: DrawDraft, p: Point): DrawDraft => ({
  ...draft,
  cursor: p,
});

export const undoVertex = (draft: DrawDraft): DrawDraft => ({
  ...draft,
  vertices: draft.vertices.slice(0, -1),
});

/** Ring khép kín nếu đủ đỉnh, ngược lại null */
export function closeRing(draft: DrawDraft): Point[] | null {
  if (draft.vertices.length < MIN_VERTICES) return null;
  return [...draft.vertices, draft.vertices[0]];
}

/** `firstOnScreen`: vị trí pixel của đỉnh đầu, để snap khi click gần */
export function isNearFirst(
  draft: DrawDraft,
  click: { x: number; y: number },
  firstOnScreen: { x: number; y: number },
) {
  if (draft.vertices.length < MIN_VERTICES) return false;
  return (
    Math.hypot(firstOnScreen.x - click.x, firstOnScreen.y - click.y) < SNAP_PX
  );
}

type DraftFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry:
    | { type: "Point"; coordinates: Point }
    | { type: "LineString"; coordinates: Point[] };
};

export function draftGeoJson(draft: DrawDraft): {
  type: "FeatureCollection";
  features: DraftFeature[];
} {
  const path = draft.cursor
    ? [...draft.vertices, draft.cursor]
    : [...draft.vertices];
  const points = draft.vertices.map((c): DraftFeature => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: c },
  }));
  const line: DraftFeature[] =
    path.length > 1
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: path },
          },
        ]
      : [];
  return { type: "FeatureCollection", features: [...points, ...line] };
}

export type DrawKeyResult = {
  draft: DrawDraft;
  ring: Point[] | null;
  exit: boolean;
};

export function handleDrawKey(
  draft: DrawDraft,
  key: string,
): DrawKeyResult | null {
  if (key === "Enter") {
    const ring = closeRing(draft);
    return { draft: ring ? EMPTY_DRAFT : draft, ring, exit: false };
  }
  if (key === "Escape") {
    const hasDraft = draft.vertices.length > 0;
    return { draft: EMPTY_DRAFT, ring: null, exit: !hasDraft };
  }
  if (key === "Backspace")
    return { draft: undoVertex(draft), ring: null, exit: false };
  return null;
}
