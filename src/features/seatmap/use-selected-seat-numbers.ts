// Giữ source "selected-seats" (số ghế) khớp với ghế đang chọn. Ghế được chọn có thể nằm ở section
// chưa tải chunk → khi chunk tới (onSeatsAdded) thì dựng lại.
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef } from "react";
import { setSourceData } from "./apply-states";
import type { GeoFeature, MapSeat, MapVenue } from "./map-venue";
import { selectedSeatNumbers } from "./seat-numbers";

const seatIndex = (seats: readonly GeoFeature[]) =>
  new Map(seats.map((f) => [String(f.properties.sid), f] as const));

/** Trả về callback cho useSectionSeats: báo mỗi đợt ghế vừa vào source */
export function useSelectedSeatNumbers(
  map: MapLibreMap | null,
  venue: MapVenue | null,
  selection: readonly string[],
) {
  // sid → ghế đã có trong source. Cố ý thêm tại chỗ thay vì chép Map mới: venue lớn có ~135k ghế,
  // chép lại mỗi đợt chunk sẽ thành O(n²)
  const seats = useRef(new Map<string, GeoFeature>());
  const current = useRef(selection);

  const render = useCallback(() => {
    if (!map) return;
    setSourceData(
      map,
      "selected-seats",
      selectedSeatNumbers(current.current, (sid) => seats.current.get(sid)),
    );
  }, [map]);

  // Venue đổi → làm lại index; bản cũ không có chunk đã có sẵn mọi ghế trong geojson
  useEffect(() => {
    seats.current = seatIndex(venue?.geojson.seats.features ?? []);
    render();
  }, [venue, render]);

  useEffect(() => {
    current.current = selection;
    render();
  }, [selection, render]);

  return useCallback(
    (added: readonly MapSeat[]) => {
      for (const seat of added) seats.current.set(seat.properties.sid, seat);
      const selected = new Set(current.current);
      if (added.some((s) => selected.has(s.properties.sid))) render();
    },
    [render],
  );
}
