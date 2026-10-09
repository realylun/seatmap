// Phần thuần của auto-detect: vùng pixel (+ tên OCR) → section nháp cho addSections.
import type { DetectedShape } from "@/domain/venue/detect";
import { facingEdge, sectionDepth } from "@/domain/venue/geometry";
import type { Extent, Point } from "@/domain/venue/types";
import type { SectionDraft } from "@/domain/venue/venue-file";
import { pixelProjector } from "./projection";

const ROW_DEPTH = 0.35; // độ sâu 1 row (đơn vị toạ độ map) để ước lượng số row
const MAX_ROWS = 40;

type ImageSize = { readonly width: number; readonly height: number };

function toDraft(
  region: DetectedShape,
  name: string | null,
  project: (p: Point) => Point,
  venueCenter: Point,
): SectionDraft {
  const ring = region.ring.map(project);
  const frontEdge = facingEdge(ring, venueCenter);
  const rowCount = Math.min(
    MAX_ROWS,
    Math.max(1, Math.round(sectionDepth(ring, frontEdge) / ROW_DEPTH)),
  );
  return { ...(name ? { id: name } : {}), ring, frontEdge, rowCount };
}

/** Row A quay về tâm của tất cả vùng (≈ sân khấu / sân) */
export function regionsToDrafts(
  regions: readonly DetectedShape[],
  names: readonly (string | null)[],
  extent: Extent,
  size: ImageSize,
): SectionDraft[] {
  const project = pixelProjector(extent, size.width, size.height);
  const centers = regions.map((r) => project(r.center));
  const venueCenter = centers.reduce<Point>(
    ([x, y], [cx, cy]) => [x + cx / centers.length, y + cy / centers.length],
    [0, 0],
  );
  return regions.map((r, i) =>
    toDraft(r, names[i] ?? null, project, venueCenter),
  );
}
