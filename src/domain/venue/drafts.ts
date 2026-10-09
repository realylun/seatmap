// Polygon section (đã ở toạ độ map) → section nháp cho addSections. Dùng chung cho mọi nguồn
// nhận diện (ảnh nền, SVG): row A quay về venueCenter, số row ước lượng theo độ sâu section.
import { facingEdge, sectionDepth } from "./geometry";
import type { Point } from "./types";
import type { SectionDraft } from "./venue-file";

export const ROW_DEPTH = 0.35; // độ sâu 1 row (đơn vị toạ độ map) để ước lượng số row
export const MAX_ROWS = 40;

export function ringToDraft(
  ring: readonly Point[],
  venueCenter: Point,
): SectionDraft {
  const frontEdge = facingEdge(ring, venueCenter);
  const rowCount = Math.min(
    MAX_ROWS,
    Math.max(1, Math.round(sectionDepth(ring, frontEdge) / ROW_DEPTH)),
  );
  return { ring: [...ring], frontEdge, rowCount };
}
