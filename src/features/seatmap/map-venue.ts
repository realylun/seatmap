// venue.json (geometry Blob) → dạng map dùng: tâm/viền section, tâm row cho price pin,
// geojson có thêm `rid`/`sid` để promoteId (feature-state theo row / ghế, như seatmap-demo/style.js).
import { rowKey } from "@/domain/seats/seat-id";
import { venueSchema, type Point, type Venue } from "@/domain/venue/types";

export type GeoFeature = {
  readonly type: "Feature";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: { readonly type: string; readonly coordinates: unknown };
};

export type FeatureCollection = {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoFeature[];
};

export type MapRow = { readonly name: string; readonly center: Point };

export type MapSection = {
  readonly id: string;
  readonly center: Point;
  readonly ring: readonly Point[];
  readonly rows: readonly MapRow[];
};

export type MapVenue = {
  readonly bounds: readonly [Point, Point];
  readonly sections: readonly MapSection[];
  readonly geojson: {
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
    })),
  };
}

const collection = (
  features: FeatureCollection["features"],
): FeatureCollection => ({ type: "FeatureCollection", features });

export function toMapVenue(venue: Venue): MapVenue {
  const { geojson } = venue;
  return {
    bounds: venue.bounds,
    sections: venue.sections.map(toMapSection),
    geojson: {
      field: geojson.field,
      sections: geojson.sections,
      rows: collection(
        geojson.rows.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            rid: rowKey(f.properties.section, f.properties.row),
          },
        })),
      ),
      seats: collection(
        geojson.seats.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            sid: `${f.properties.section}|${f.properties.row}|${f.properties.seat}`,
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
