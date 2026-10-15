// Nối seat-loader với vòng đời map: tải lại theo khung nhìn mỗi khi camera dừng, và ngay khi section
// ghim (hover / chọn / bay tới) đổi. Không có overviewUrl (version cũ) → không làm gì, ghế đã có sẵn.
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import type { MapVenue } from "./map-venue";
import { createSeatLoader, type SeatLoader } from "./seat-loader";

const NOTHING_TO_CLEAN = () => {};

/** `pinned` phải giữ nguyên tham chiếu giữa các lần render (useMemo ở nơi gọi) */
export function useSectionSeats(
  map: MapLibreMap | null,
  venue: MapVenue | null,
  overviewUrl: string | null,
  pinned: readonly (string | null)[],
) {
  const loader = useRef<SeatLoader | null>(null);
  // listener moveend luôn đọc pinned mới nhất mà không phải tạo lại loader
  const refresh = useEffectEvent((current: SeatLoader) => {
    current.update(pinned);
  });

  useEffect(() => {
    if (!map || !venue || !overviewUrl) return NOTHING_TO_CLEAN;
    const current = createSeatLoader(map, venue, overviewUrl);
    loader.current = current;
    const onMoveEnd = () => refresh(current);
    map.on("moveend", onMoveEnd);
    onMoveEnd();
    return () => {
      map.off("moveend", onMoveEnd);
      current.dispose();
      loader.current = null;
    };
  }, [map, venue, overviewUrl]);

  useEffect(() => {
    loader.current?.update(pinned);
  }, [pinned]);
}
