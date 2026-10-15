// Định dạng venue.json (export của editor) + cấu hình section. Schema zod dùng để validate
// mọi file import / Blob; type được suy ra từ schema để chỉ có 1 nguồn sự thật.
import { z } from "zod";

export const pointSchema = z.tuple([z.number(), z.number()]);
export const ringSchema = z.array(pointSchema).min(4);

export const numberingSchema = z.enum(["ltr", "rtl"]);

// Ghế đặt tay (vd. import từ SVG): giữ nguyên vị trí + số ghế, không sinh bằng generateRows
const explicitSeatSchema = z.object({
  number: z.number().int().positive(),
  at: pointSchema,
});

const hasDuplicates = (values: readonly (string | number)[]) =>
  new Set(values).size !== values.length;

export const explicitRowSchema = z
  .object({
    name: z.string().trim().min(1),
    seats: z.array(explicitSeatSchema).min(1),
  })
  .refine((row) => !hasDuplicates(row.seats.map((s) => s.number)), {
    message: "Số ghế bị trùng trong row",
    path: ["seats"],
  });

export const sectionConfigSchema = z.object({
  id: z.string().min(1),
  ring: ringSchema,
  frontEdge: z.number().int(),
  rowStart: z.string().min(1),
  rowCount: z.number().int().min(0),
  rowSkip: z.array(z.string()),
  seatsPerRow: z.number().int().min(0),
  overrides: z.string(),
  seatSpacing: z.number().positive(),
  numbering: numberingSchema,
  // thiếu = sinh row/ghế từ các tham số ở trên (file cũ)
  explicitRows: z
    .array(explicitRowSchema)
    .min(1)
    .refine((rows) => !hasDuplicates(rows.map((r) => r.name.toUpperCase())), {
      message: "Tên row bị trùng trong section",
    })
    .optional(),
});

export const extentSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});

// Vật thể không bán vé (sân khấu, B-stage...) nhận diện từ vùng tối của ảnh nền
export const venueObjectSchema = z.object({
  kind: z.literal("stage"),
  ring: ringSchema,
});

export const editorBlockSchema = z.object({
  extent: extentSchema,
  sections: z.array(sectionConfigSchema),
  // optional: block editor / file cũ không có → coi như []
  objects: z.array(venueObjectSchema).optional(),
});

const feature = <P extends z.ZodType, G extends z.ZodType>(
  properties: P,
  geometry: G,
) => z.object({ type: z.literal("Feature"), properties, geometry });

const collection = <F extends z.ZodType>(item: F) =>
  z.object({ type: z.literal("FeatureCollection"), features: z.array(item) });

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(ringSchema),
});
const lineSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.tuple([pointSchema, pointSchema]),
});
const pointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: pointSchema,
});

export const sectionFeatureSchema = feature(
  z.object({ section: z.string() }),
  polygonSchema,
);
export const rowFeatureSchema = feature(
  z.object({ section: z.string(), row: z.string(), seats: z.number().int() }),
  lineSchema,
);
export const seatFeatureSchema = feature(
  z.object({
    section: z.string(),
    row: z.string(),
    seat: z.number().int().positive(),
  }),
  pointGeometrySchema,
);
// Sân (field) do người dùng thêm tay → chỉ cần đúng dạng Feature
const anyFeatureSchema = feature(
  z.record(z.string(), z.unknown()),
  z.object({ type: z.string(), coordinates: z.unknown() }),
);

export const venueSectionSchema = z.object({
  id: z.string().min(1),
  center: pointSchema,
  feature: sectionFeatureSchema,
  rows: z.array(
    z.object({ feature: rowFeatureSchema, seats: z.array(seatFeatureSchema) }),
  ),
});

export const venueSchema = z.object({
  version: z.literal(1),
  bounds: z.tuple([pointSchema, pointSchema]),
  // khoảng cách ghế đặc trưng, publish tính sẵn (seat-spacing.ts); thiếu = file cũ, client tự đo
  seatSpacing: z.number().positive().optional(),
  sections: z.array(venueSectionSchema),
  geojson: z.object({
    field: collection(anyFeatureSchema),
    sections: collection(sectionFeatureSchema),
    rows: collection(rowFeatureSchema),
    seats: collection(seatFeatureSchema),
  }),
});

export const venueFileSchema = venueSchema.extend({
  editor: editorBlockSchema,
});

export type Point = z.infer<typeof pointSchema>;
export type Ring = readonly Point[];
export type Numbering = z.infer<typeof numberingSchema>;
export type ExplicitRow = z.infer<typeof explicitRowSchema>;
export type SectionConfig = z.infer<typeof sectionConfigSchema>;
export type Extent = z.infer<typeof extentSchema>;
export type VenueObject = z.infer<typeof venueObjectSchema>;
export type EditorBlock = z.infer<typeof editorBlockSchema>;
export type SectionFeature = z.infer<typeof sectionFeatureSchema>;
export type RowFeature = z.infer<typeof rowFeatureSchema>;
export type SeatFeature = z.infer<typeof seatFeatureSchema>;
export type VenueSection = z.infer<typeof venueSectionSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type VenueFile = z.infer<typeof venueFileSchema>;
