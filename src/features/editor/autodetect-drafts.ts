// Phần thuần của auto-detect: vùng pixel (+ tên OCR) → section nháp cho addSections.
import type { DetectedShape } from "@/domain/venue/detect";
import { ringToDraft } from "@/domain/venue/drafts";
import { pixelProjector } from "@/domain/venue/projection";
import type { Extent, Point, VenueObject } from "@/domain/venue/types";
import type { SectionDraft } from "@/domain/venue/venue-file";

type ImageSize = { readonly width: number; readonly height: number };

function toDraft(
  region: DetectedShape,
  name: string | null,
  project: (p: Point) => Point,
  venueCenter: Point,
): SectionDraft {
  const draft = ringToDraft(region.ring.map(project), venueCenter);
  return { ...(name ? { id: name } : {}), ...draft };
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

/** Vùng tối (sân khấu, B-stage) → polygon toạ độ map, cùng phép chiếu với section */
export function shapesToObjects(
  shapes: readonly DetectedShape[],
  extent: Extent,
  size: ImageSize,
): VenueObject[] {
  const project = pixelProjector(extent, size.width, size.height);
  return shapes.map((s) => ({ kind: "stage", ring: s.ring.map(project) }));
}
