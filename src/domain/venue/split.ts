// Tách venue.json thành overview + chunk ghế theo section (xem overview.ts). Hàm thuần: publish
// gọi rồi upload qua serializeGeometry (làm tròn toạ độ như file đầy đủ); ghép các chunk lại
// (chunkSeatFeatures) ra đúng venue.geojson.seats.
// Overview và chunk đều lấy từ venue.sections để row ↔ ghế luôn khớp 1-1; venue mâu thuẫn
// (id section trùng, ghế ghi sai section/row) bị từ chối lúc publish thay vì thành sid lệch ở client.
import type { SectionChunk, VenueOverview } from "./overview";
import { medianSeatSpacing } from "./seat-spacing";
import type { SeatFeature, Venue, VenueSection } from "./types";

export type ChunkFile = { readonly path: string; readonly chunk: SectionChunk };

export type SplitVenue = {
  readonly overview: VenueOverview;
  readonly chunks: readonly ChunkFile[];
};

/** Theo thứ tự section thay vì id: id là chữ người dùng nhập, không an toàn làm tên file */
const chunkPath = (index: number) => `s/${index}.json`;

const seatCount = (section: VenueSection) =>
  section.rows.reduce((n, r) => n + r.seats.length, 0);

function assertUniqueIds(sections: readonly VenueSection[]) {
  const seen = new Set<string>();
  for (const { id } of sections) {
    if (seen.has(id)) throw new Error(`Section "${id}" bị trùng id`);
    seen.add(id);
  }
}

function toChunk(section: VenueSection): SectionChunk {
  return {
    version: 1,
    section: section.id,
    rows: section.rows.map((r) => {
      const name = r.feature.properties.row;
      return {
        name,
        seats: r.seats.map((s) => {
          const { section: sid, row, seat } = s.properties;
          if (sid !== section.id || row !== name) {
            throw new Error(
              `Ghế ${sid}/${row}/${seat} nằm trong section "${section.id}" row "${name}"`,
            );
          }
          const [x, y] = s.geometry.coordinates;
          return [seat, x, y];
        }),
      };
    }),
  };
}

export function splitVenue(venue: Venue): SplitVenue {
  assertUniqueIds(venue.sections);
  const overview: VenueOverview = {
    version: 1,
    bounds: venue.bounds,
    seatSpacing: venue.seatSpacing ?? medianSeatSpacing(venue.geojson.seats),
    field: venue.geojson.field,
    sections: venue.sections.map((s, i) => ({
      id: s.id,
      center: s.center,
      polygon: s.feature.geometry.coordinates,
      seatCount: seatCount(s),
      chunk: chunkPath(i),
    })),
    rows: {
      type: "FeatureCollection",
      features: venue.sections.flatMap((s) => s.rows.map((r) => r.feature)),
    },
  };
  const chunks = venue.sections.map((s, i) => ({
    path: chunkPath(i),
    chunk: toChunk(s),
  }));
  return { overview, chunks };
}

/** Chunk → Feature ghế đúng như trong venue.geojson.seats */
export function chunkSeatFeatures(chunk: SectionChunk): SeatFeature[] {
  return chunk.rows.flatMap((row) =>
    row.seats.map(([seat, x, y]): SeatFeature => ({
      type: "Feature",
      properties: { section: chunk.section, row: row.name, seat },
      geometry: { type: "Point", coordinates: [x, y] },
    })),
  );
}
