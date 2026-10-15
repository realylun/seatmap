// Định dạng tải theo tầng cho seat map: overview.json (vẽ được ngay: viền section, row, sân khấu)
// + mỗi section 1 chunk ghế, client tải khi zoom tới. Venue 135k ghế: file đầy đủ 38,8 MB raw,
// overview ~1,25 MB, 1 chunk ≤ ~0,14 MB. Tách từ venue bằng split.ts lúc publish.
import { z } from "zod";
import { pointSchema, venueSchema, venueSectionSchema } from "./types";

const { field, rows } = venueSchema.shape.geojson.shape;
const polygonCoordinates =
  venueSectionSchema.shape.feature.shape.geometry.shape.coordinates;

export const overviewSectionSchema = z.object({
  id: z.string().min(1),
  center: pointSchema,
  polygon: polygonCoordinates,
  seatCount: z.number().int().nonnegative(),
  /** Đường dẫn chunk ghế, tương đối so với URL của overview */
  chunk: z.string().min(1),
});

export const venueOverviewSchema = z.object({
  version: z.literal(1),
  bounds: venueSchema.shape.bounds,
  /** 0 nếu venue không đo được (không có ghế) */
  seatSpacing: z.number().nonnegative(),
  field,
  sections: z.array(overviewSectionSchema),
  rows,
});

/** [số ghế, x, y]: tuple thay vì GeoJSON Feature, client dựng lại Feature khi nạp */
const chunkSeatSchema = z.tuple([
  z.number().int().positive(),
  z.number(),
  z.number(),
]);

export const sectionChunkSchema = z.object({
  version: z.literal(1),
  section: z.string().min(1),
  rows: z.array(
    // name cùng ràng buộc với rowFeatureSchema.row: venue hợp lệ nào cũng ra chunk hợp lệ
    z.object({ name: z.string(), seats: z.array(chunkSeatSchema) }),
  ),
});

export type OverviewSection = z.infer<typeof overviewSectionSchema>;
export type VenueOverview = z.infer<typeof venueOverviewSchema>;
export type SectionChunk = z.infer<typeof sectionChunkSchema>;
