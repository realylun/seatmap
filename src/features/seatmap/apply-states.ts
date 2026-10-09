// Áp feature-state / dữ liệu nguồn động lên map MapLibre (phần imperative, không test unit).
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { DynamicSource } from "./build-style";
import { diffStates, type StateMap } from "./feature-states";
import type { FeatureCollection } from "./map-venue";

type StateSource = "sections" | "rows" | "seats";

/** Áp phần chênh giữa `prev` và `next`; trả về `next` để lưu làm mốc lần sau */
export function applyStateDiff(
  map: MapLibreMap,
  source: StateSource,
  prev: StateMap,
  next: StateMap,
  cleared: Readonly<Record<string, null | number | boolean>>,
): StateMap {
  const { set, remove } = diffStates(prev, next);
  for (const [id, state] of set) map.setFeatureState({ source, id }, state);
  // set về giá trị "rỗng" thay vì removeFeatureState để không xoá các khoá khác (vd. selected)
  for (const id of remove) map.setFeatureState({ source, id }, cleared);
  return next;
}

export function setSourceData(
  map: MapLibreMap,
  id: DynamicSource,
  data: FeatureCollection,
) {
  const source = map.getSource<GeoJSONSource>(id);
  void source?.setData(data);
}

/** Đánh dấu ghế đang chọn: tắt ghế bỏ chọn, bật ghế mới chọn */
export function applySelection(
  map: MapLibreMap,
  prev: readonly string[],
  next: readonly string[],
) {
  const nextSet = new Set(next);
  const prevSet = new Set(prev);
  for (const sid of prev) {
    if (!nextSet.has(sid))
      map.setFeatureState({ source: "seats", id: sid }, { selected: false });
  }
  for (const sid of next) {
    if (!prevSet.has(sid))
      map.setFeatureState({ source: "seats", id: sid }, { selected: true });
  }
}
