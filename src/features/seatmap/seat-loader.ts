// Tải chunk ghế theo section và thêm vào source "seats" bằng updateData (không setData cả venue).
// Phần imperative (fetch + MapLibre), kiểm chứng bằng e2e; chọn section ở section-loader.ts (thuần).
// Feature-state theo sid (trạng thái, đang chọn) lưu ở cấp source nên áp được cả trước khi ghế tới.
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { ringBounds } from "./camera";
import { chunkUrl, parseChunk, type MapSeat, type MapVenue } from "./map-venue";
import { sectionsToLoad, type LoaderView } from "./section-loader";

/** Số chunk tải song song (chunk nhỏ, vài KB nén) */
const MAX_PARALLEL = 6;

export type SeatLoader = {
  /** Tính lại section cần tải theo khung nhìn hiện tại + section ghim; gọi khi camera dừng */
  readonly update: (pinned: readonly (string | null)[]) => void;
  readonly dispose: () => void;
};

function currentView(map: MapLibreMap): LoaderView {
  const b = map.getBounds();
  return {
    zoom: map.getZoom(),
    bounds: [
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ],
  };
}

export function createSeatLoader(
  map: MapLibreMap,
  venue: MapVenue,
  overviewUrl: string,
): SeatLoader {
  const chunkOf = new Map(
    venue.sections.flatMap((s) => (s.chunk ? [[s.id, s.chunk] as const] : [])),
  );
  const sections = venue.sections
    .filter((s) => chunkOf.has(s.id))
    .map((s) => ({ id: s.id, bounds: ringBounds(s.ring) }));
  const loaded = new Set<string>();
  const inFlight = new Set<string>();
  const controller = new AbortController();
  let queue: readonly string[] = [];
  let pending: readonly MapSeat[] = [];
  let frame = 0;

  // Gom các chunk về trong cùng 1 frame thành 1 lần updateData
  const flush = () => {
    frame = 0;
    const add = pending;
    pending = [];
    void map.getSource<GeoJSONSource>("seats")?.updateData({ add: [...add] });
  };

  async function load(id: string) {
    inFlight.add(id);
    try {
      const url = chunkUrl(overviewUrl, chunkOf.get(id) ?? "", location.href);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { seats } = parseChunk(await res.json());
      loaded.add(id);
      pending = [...pending, ...seats];
      frame ||= requestAnimationFrame(flush);
    } catch (error) {
      // lỗi: không đánh dấu loaded → lần update sau (camera dừng) thử lại
      if (!controller.signal.aborted)
        console.error("seat chunk failed", { section: id, error });
    } finally {
      inFlight.delete(id);
      pump();
    }
  }

  function pump() {
    if (controller.signal.aborted) return;
    while (inFlight.size < MAX_PARALLEL && queue.length > 0) {
      const [id, ...rest] = queue;
      queue = rest;
      void load(id);
    }
  }

  return {
    update(pinned) {
      if (controller.signal.aborted) return;
      // thay cả hàng đợi: section đã ra khỏi khung nhìn thì thôi, ưu tiên theo khung nhìn mới
      const skip = new Set([...loaded, ...inFlight]);
      queue = sectionsToLoad(currentView(map), sections, skip, pinned);
      pump();
    },
    dispose() {
      controller.abort();
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
