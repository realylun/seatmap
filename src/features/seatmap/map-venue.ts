// venue.json (geometry Blob) → dạng map dùng: tâm/viền section, tâm row cho price pin,
// geojson có thêm `rid`/`sid` để promoteId (feature-state theo row / ghế, như seatmap-demo/style.js).
import { rowKey } from "@/domain/seats/seat-id";
import { venueSchema, type Point, type Venue } from "@/domain/venue/types";
import { medianSeatSpacing, outlineRing } from "./venue-shape";

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
    readonly seats: FeatureCollection;
  };
};

const midpoint = ([a, b]: readonly [Point, Point]): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

function toMapSection(section: Venue["sections"][number]): MapSection {
  return {
    id: section.id,
    center: section.center,
    ring: section.feature.geometry.coordinates[0],
    rows: section.rows.map((r) => ({
      name: r.feature.properties.row,
      center: midpoint(r.feature.geometry.coordinates),
      start: r.feature.geometry.coordinates[0],
    })),
  };
}

const collection = (
  features: FeatureCollection["features"],
): FeatureCollection => ({ type: "FeatureCollection", features });

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

export function toMapVenue(venue: Venue): MapVenue {
  const { geojson } = venue;
  const sections = venue.sections.map(toMapSection);
  const seats = collection(
    geojson.seats.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        sid: `${f.properties.section}|${f.properties.row}|${f.properties.seat}`,
      },
    })),
  );
  return {
    bounds: venue.bounds,
    focus: sectionsCenter(sections) ?? midpoint(venue.bounds),
    seatSpacing: medianSeatSpacing(seats),
    sections,
    geojson: {
      outline: outline(sections),
      field: geojson.field,
      sections: geojson.sections,
      seats,
      rows: collection(
        geojson.rows.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            rid: rowKey(f.properties.section, f.properties.row),
          },
        })),
      ),
    },
  };
}

/** Validate JSON tải từ Blob (dữ liệu ngoài) rồi chuyển sang MapVenue */
export function parseMapVenue(json: unknown): MapVenue {
  const parsed = venueSchema.safeParse(json);
  if (!parsed.success) throw new Error("Seat map geometry is invalid");
  return toMapVenue(parsed.data);
}
