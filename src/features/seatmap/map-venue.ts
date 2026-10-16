// Geometry (venue.json đầy đủ, hoặc overview.json + chunk ghế theo section) → dạng map dùng:
// tâm/viền section, tâm row cho price pin, geojson có thêm `rid`/`sid` để promoteId (feature-state
// theo row / ghế, như seatmap-demo/style.js). 2 đường tải đi qua cùng buildMapVenue nên vẽ giống hệt.
import { rowKey } from "@/domain/seats/seat-id";
import {
  sectionChunkSchema,
  venueOverviewSchema,
} from "@/domain/venue/overview";
import { medianSeatSpacing } from "@/domain/venue/seat-spacing";
import { chunkSeatFeatures } from "@/domain/venue/split";
import {
  venueSchema,
  type Point,
  type RowFeature,
  type SeatFeature,
  type SectionFeature,
  type Venue,
} from "@/domain/venue/types";
import { outlineRing } from "./venue-shape";

/** Viền sân nới ra ngoài bao lồi các section bấy nhiêu (tỉ lệ) */
const OUTLINE_SCALE = 0.04;

export type GeoFeature = {
  readonly type: "Feature";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: { readonly type: string; readonly coordinates: unknown };
};

export type FeatureCollection = {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoFeature[];
};

export type MapRow = {
  readonly name: string;
  readonly center: Point;
  /** Đầu row (phía ghế số 1): chỗ cắm price pin như SeatGeek */
  readonly start: Point;
};

export type MapSection = {
  readonly id: string;
  readonly center: Point;
  readonly ring: readonly Point[];
  readonly rows: readonly MapRow[];
  /** Chunk ghế (tương đối so với URL overview); chỉ có khi tải theo tầng */
  readonly chunk?: string;
};

export type MapVenue = {
  readonly bounds: readonly [Point, Point];
  /** Điểm camera hướng về khi nhìn từ ghế (tâm sân) */
  readonly focus: Point;
  /** Khoảng cách 2 ghế liền nhau (đơn vị map) → bán kính ghế theo tỉ lệ thật */
  readonly seatSpacing: number;
  readonly sections: readonly MapSection[];
  readonly geojson: {
    readonly outline: FeatureCollection;
    readonly field: FeatureCollection;
    readonly sections: FeatureCollection;
    readonly rows: FeatureCollection;
    /** Tải theo tầng: rỗng, ghế được thêm dần theo section (use-section-seats) */
    readonly seats: FeatureCollection;
  };
};

type SectionPart = {
  readonly feature: SectionFeature;
  readonly center: Point;
  readonly rows: readonly RowFeature[];
  readonly chunk?: string;
};

type VenueParts = {
  readonly bounds: readonly [Point, Point];
  readonly seatSpacing: number;
  readonly field: FeatureCollection;
  readonly sections: readonly SectionPart[];
  readonly rows: readonly RowFeature[];
  readonly seats: readonly GeoFeature[];
};

const midpoint = ([a, b]: readonly [Point, Point]): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

const collection = (
  features: FeatureCollection["features"],
): FeatureCollection => ({ type: "FeatureCollection", features });

function toMapSection({
  feature,
  center,
  rows,
  chunk,
}: SectionPart): MapSection {
  return {
    id: feature.properties.section,
    center,
    ring: feature.geometry.coordinates[0],
    rows: rows.map((r) => ({
      name: r.properties.row,
      center: midpoint(r.geometry.coordinates),
      start: r.geometry.coordinates[0],
    })),
    ...(chunk ? { chunk } : {}),
  };
}

function outline(sections: readonly MapSection[]): FeatureCollection {
  const ring = outlineRing(
    sections.map((s) => s.ring),
    OUTLINE_SCALE,
  );
  if (ring.length === 0) return collection([]);
  return collection([
    {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    },
  ]);
}

/** Tâm khung bao mọi section (sân có thể không nằm giữa ảnh nền) */
function sectionsCenter(sections: readonly MapSection[]): Point | null {
  const pts = sections.flatMap((s) => s.ring);
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return midpoint([
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ]);
}

/** Ghế kèm `sid` (promoteId) — đúng kiểu GeoJSON Point để đưa thẳng vào updateData */
export type MapSeat = SeatFeature & {
  readonly properties: SeatFeature["properties"] & {
    readonly sid: string;
    /** Màu tier, seat-loader gắn lúc thêm vào source */
    readonly color?: string;
  };
};

const withSid = (f: SeatFeature): MapSeat => ({
  ...f,
  properties: {
    ...f.properties,
    sid: `${f.properties.section}|${f.properties.row}|${f.properties.seat}`,
  },
});

const withRid = (f: RowFeature): GeoFeature => ({
  ...f,
  properties: {
    ...f.properties,
    rid: rowKey(f.properties.section, f.properties.row),
  },
});

function buildMapVenue(parts: VenueParts): MapVenue {
  const sections = parts.sections.map(toMapSection);
  return {
    bounds: parts.bounds,
    focus: sectionsCenter(sections) ?? midpoint(parts.bounds),
    seatSpacing: parts.seatSpacing,
    sections,
    geojson: {
      outline: outline(sections),
      field: parts.field,
      sections: collection(parts.sections.map((s) => s.feature)),
      seats: collection(parts.seats),
      rows: collection(parts.rows.map(withRid)),
    },
  };
}

export function toMapVenue(venue: Venue): MapVenue {
  const seats = venue.geojson.seats.features.map(withSid);
  return buildMapVenue({
    bounds: venue.bounds,
    seatSpacing: venue.seatSpacing ?? medianSeatSpacing({ features: seats }),
    field: venue.geojson.field,
    sections: venue.sections.map((s) => ({
      feature: s.feature,
      center: s.center,
      rows: s.rows.map((r) => r.feature),
    })),
    rows: venue.geojson.rows.features,
    seats,
  });
}

/** Validate JSON tải từ Blob (dữ liệu ngoài) rồi chuyển sang MapVenue */
export function parseMapVenue(json: unknown): MapVenue {
  const parsed = venueSchema.safeParse(json);
  if (!parsed.success) throw new Error("Seat map geometry is invalid");
  return toMapVenue(parsed.data);
}

/** Row theo section, 1 lượt (Map.groupBy cần Safari 17.4+) */
function groupRows(rows: readonly RowFeature[]): Map<string, RowFeature[]> {
  const groups = new Map<string, RowFeature[]>();
  for (const r of rows) {
    const group = groups.get(r.properties.section);
    if (group) group.push(r);
    else groups.set(r.properties.section, [r]);
  }
  return groups;
}

/** overview.json → MapVenue chưa có ghế; mỗi section mang đường dẫn chunk ghế của nó */
export function parseOverview(json: unknown): MapVenue {
  const parsed = venueOverviewSchema.safeParse(json);
  if (!parsed.success) throw new Error("Seat map overview is invalid");
  const overview = parsed.data;
  const rows = overview.rows.features;
  const rowsBySection = groupRows(rows);
  return buildMapVenue({
    bounds: overview.bounds,
    seatSpacing: overview.seatSpacing,
    field: overview.field,
    sections: overview.sections.map((s) => ({
      feature: {
        type: "Feature",
        properties: { section: s.id },
        geometry: { type: "Polygon", coordinates: s.polygon },
      },
      center: s.center,
      rows: rowsBySection.get(s.id) ?? [],
      chunk: s.chunk,
    })),
    rows,
    seats: [],
  });
}

export type LoadedChunk = {
  readonly section: string;
  readonly seats: readonly MapSeat[];
};

/** Chunk ghế 1 section → Feature có `sid`, giống ghế của file đầy đủ */
export function parseChunk(json: unknown): LoadedChunk {
  const parsed = sectionChunkSchema.safeParse(json);
  if (!parsed.success) throw new Error("Seat chunk is invalid");
  return {
    section: parsed.data.section,
    seats: chunkSeatFeatures(parsed.data).map(withSid),
  };
}

/** URL chunk: tương đối so với overview, overview có thể là đường dẫn gốc (/local-blob/...) */
export function chunkUrl(overviewUrl: string, chunk: string, base: string) {
  return new URL(chunk, new URL(overviewUrl, base)).href;
}
