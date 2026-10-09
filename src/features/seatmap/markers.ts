// Price pin trên map (port seatmap-demo/listings.js sectionMarkers/rowMarkers): mỗi section / row
// 1 điểm mang giá rẻ nhất + màu tier. Glyph tự host chỉ có Latin cơ bản → nhãn giá dạng ASCII.
import type { Listing } from "@/domain/seats/listings";
import { rowKey } from "@/domain/seats/seat-id";
import type { Point } from "@/domain/venue/types";
import type { FeatureCollection, GeoFeature, MapSection } from "./map-venue";

type PricedListing = Pick<Listing, "section" | "row" | "price" | "tierId">;

/** 850000 → "850K", 1250000 → "1.3M" */
export function formatPriceShort(vnd: number): string {
  if (vnd >= 1_000_000) {
    return `${(vnd / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (vnd >= 1000) return `${Math.round(vnd / 1000)}K`;
  return String(vnd);
}

/** Tên ảnh pill an toàn từ mã màu (#E4572E → e4572e) */
export function colorKey(color: string): string {
  return color.toLowerCase().replace(/[^0-9a-z]/g, "");
}

function cheapestBy(
  listings: readonly PricedListing[],
  key: (l: PricedListing) => string,
): PricedListing[] {
  const best = new Map<string, PricedListing>();
  for (const l of listings) {
    const current = best.get(key(l));
    if (!current || l.price < current.price) best.set(key(l), l);
  }
  return [...best.values()];
}

function marker(
  l: PricedListing,
  coordinates: Point,
  colorOf: (tierId: string) => string,
): GeoFeature {
  return {
    type: "Feature",
    properties: {
      section: l.section,
      row: l.row,
      price: l.price,
      label: formatPriceShort(l.price),
      colorKey: colorKey(colorOf(l.tierId)),
    },
    geometry: { type: "Point", coordinates },
  };
}

const collection = (features: GeoFeature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

export function sectionMarkers(
  listings: readonly PricedListing[],
  sections: ReadonlyMap<string, MapSection>,
  colorOf: (tierId: string) => string,
): FeatureCollection {
  return collection(
    cheapestBy(listings, (l) => l.section).flatMap((l) => {
      const section = sections.get(l.section);
      return section ? [marker(l, section.center, colorOf)] : [];
    }),
  );
}

export function rowMarkers(
  listings: readonly PricedListing[],
  sections: ReadonlyMap<string, MapSection>,
  colorOf: (tierId: string) => string,
): FeatureCollection {
  return collection(
    cheapestBy(listings, (l) => rowKey(l.section, l.row)).flatMap((l) => {
      const row = sections.get(l.section)?.rows.find((r) => r.name === l.row);
      return row ? [marker(l, row.start, colorOf)] : [];
    }),
  );
}

/** Polygon 1 section cho nguồn hovered/selected (rỗng nếu không có); `color` = tint khi chọn */
export function sectionShape(
  section: MapSection | undefined,
  color: string | null = null,
): FeatureCollection {
  if (!section) return collection([]);
  return collection([
    {
      type: "Feature",
      properties: { section: section.id, color },
      geometry: { type: "Polygon", coordinates: [section.ring] },
    },
  ]);
}
