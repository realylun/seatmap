// Số ghế chỉ hiện trên ghế đang chọn. Layer symbol trên cả source "seats" phải dựng glyph cho mọi
// ghế trong khung nhìn (dù ẩn bằng opacity) → tụt FPS khi pan trong section. Thay vào đó dựng một
// source nhỏ chỉ gồm các ghế đang chọn.
import type { FeatureCollection, GeoFeature } from "./map-venue";

export function selectedSeatNumbers(
  selection: readonly string[],
  seatOf: (sid: string) => GeoFeature | undefined,
): FeatureCollection {
  const features = selection.flatMap((sid): GeoFeature[] => {
    const seat = seatOf(sid);
    if (!seat) return [];
    return [
      {
        type: "Feature",
        properties: { sid, seat: seat.properties.seat },
        geometry: seat.geometry,
      },
    ];
  });
  return { type: "FeatureCollection", features };
}
