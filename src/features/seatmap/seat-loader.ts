// Tải chunk ghế theo section và thêm vào source "seats" bằng updateData (không setData cả venue).
// Chọn section ở section-loader.ts (thuần). Feature-state theo sid (trạng thái, đang chọn) lưu ở cấp
// source nên áp được cả trước khi ghế tới.
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { ringBounds } from "./camera";
import { chunkUrl, parseChunk, type MapSeat, type MapVenue } from "./map-venue";
import { sectionsToLoad, type LoaderView } from "./section-loader";

/** Số chunk tải song song (chunk nhỏ, vài KB nén) */
const MAX_PARALLEL = 6;
/** Chờ trước lần thử lại thứ 2, 3 (ms); hết lượt thì bỏ section đó cho tới khi tải lại trang */
const RETRY_DELAYS = [1000, 4000];
const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

export type SeatLoader = {
  /** Tính lại section cần tải theo khung nhìn hiện tại; gọi khi camera dừng hoặc section ghim đổi */
  readonly update: (
    pinned: readonly (string | null)[],
    hovered: string | null,
  ) => void;
  readonly dispose: () => void;
};

/** Thử lại cũng vô ích: chunk không tồn tại (4xx) hoặc sai định dạng */
class PermanentChunkError extends Error {}

type Failure = { readonly attempts: number; readonly retryAt: number };
type Arrived = { readonly id: string; readonly seats: readonly MapSeat[] };

function currentView(map: MapLibreMap): LoaderView {
  const b = map.getBounds();
  const { lng, lat } = map.getCenter();
  return {
    zoom: map.getZoom(),
    bounds: [
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getNorth()],
    ],
    center: [lng, lat],
    pitch: map.getPitch(),
    moving: map.isMoving(),
  };
}

async function fetchChunk(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (res.status >= 400 && res.status < 500)
    throw new PermanentChunkError(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: unknown = await res.json();
  try {
    return parseChunk(json).seats;
  } catch (error) {
    throw new PermanentChunkError("invalid chunk", { cause: error });
  }
}

export function createSeatLoader(
  map: MapLibreMap,
  venue: MapVenue,
  overviewUrl: string,
  /** Gọi sau khi một đợt ghế đã vào source (vd. để dựng số cho ghế đang chọn) */
  onSeatsAdded?: (seats: readonly MapSeat[]) => void,
): SeatLoader {
  const chunkOf = new Map(
    venue.sections.flatMap((s) => (s.chunk ? [[s.id, s.chunk] as const] : [])),
  );
  const sections = venue.sections
    .filter((s) => chunkOf.has(s.id))
    .map((s) => ({ id: s.id, bounds: ringBounds(s.ring) }));
  const controller = new AbortController();
  const { signal } = controller;
  /** Ghế đã nằm trong source */
  const loaded = new Set<string>();
  const inFlight = new Set<string>();
  /** Đã tải xong, chờ frame kế để thêm vào source */
  const waiting = new Set<string>();
  const failures = new Map<string, Failure>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let queue: readonly string[] = [];
  let arrived: readonly Arrived[] = [];
  let frame = 0;
  let last: { pinned: readonly (string | null)[]; hovered: string | null } = {
    pinned: [],
    hovered: null,
  };

  // Số section đã có ghế trong source, ghi thẳng lên DOM (không render lại React) cho e2e
  const container = map.getContainer();
  const report = () => {
    if (!signal.aborted) container.dataset.seatSections = String(loaded.size);
  };

  const seatsSource = () => map.getSource<GeoJSONSource>("seats");
  // Source có thể còn ghế của venue / version trước (style giữ nguyên khi chỉ đổi dữ liệu)
  seatsSource()
    ?.updateData({ removeAll: true })
    .catch((error: unknown) => console.error("seat reset failed", { error }));
  report();

  // Gom các chunk về trong cùng 1 frame thành 1 lần updateData; chỉ đánh dấu loaded khi đã vào source
  const flush = () => {
    frame = 0;
    const batch = arrived;
    arrived = [];
    const ids = batch.map((a) => a.id);
    const source = signal.aborted ? undefined : seatsSource();
    if (!source) {
      for (const id of ids) waiting.delete(id); // source mất (đổi style): lần update sau tải lại
      return;
    }
    const seats = batch.flatMap((a) => a.seats);
    source
      .updateData({ add: seats })
      .then(
        () => {
          // dispose trong lúc updateData chạy (đổi venue): không báo ghế cũ cho venue mới
          if (signal.aborted) return;
          ids.forEach((id) => loaded.add(id));
          try {
            onSeatsAdded?.(seats);
          } catch (error) {
            console.error("onSeatsAdded failed", { error });
          }
        },
        (error: unknown) => console.error("seat chunk add failed", { error }),
      )
      .finally(() => {
        for (const id of ids) waiting.delete(id);
        report();
      });
  };

  function scheduleRetry(delay: number) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      update(last.pinned, last.hovered);
    }, delay);
    timers.add(timer);
  }

  function recordFailure(id: string, error: unknown) {
    const attempts =
      error instanceof PermanentChunkError
        ? MAX_ATTEMPTS
        : (failures.get(id)?.attempts ?? 0) + 1;
    const delay = RETRY_DELAYS[attempts - 1];
    failures.set(id, { attempts, retryAt: Date.now() + (delay ?? 0) });
    console.error("seat chunk failed", { section: id, attempts, error });
    if (delay !== undefined) scheduleRetry(delay);
  }

  async function load(id: string) {
    inFlight.add(id);
    try {
      const url = chunkUrl(overviewUrl, chunkOf.get(id) ?? "", location.href);
      const seats = await fetchChunk(url, signal);
      if (signal.aborted) return;
      waiting.add(id);
      arrived = [...arrived, { id, seats }];
      frame ||= requestAnimationFrame(flush);
    } catch (error) {
      if (!signal.aborted) recordFailure(id, error);
    } finally {
      inFlight.delete(id);
      pump();
    }
  }

  function pump() {
    if (signal.aborted) return;
    while (inFlight.size < MAX_PARALLEL && queue.length > 0) {
      const [id, ...rest] = queue;
      queue = rest;
      void load(id);
    }
  }

  const blocked = () => {
    const now = Date.now();
    return [...failures]
      .filter(([, f]) => f.attempts >= MAX_ATTEMPTS || f.retryAt > now)
      .map(([id]) => id);
  };

  function update(pinned: readonly (string | null)[], hovered: string | null) {
    if (signal.aborted) return;
    last = { pinned, hovered };
    // thay cả hàng đợi: section đã ra khỏi khung nhìn thì thôi, ưu tiên theo khung nhìn mới
    const skip = new Set([...loaded, ...inFlight, ...waiting, ...blocked()]);
    queue = sectionsToLoad(currentView(map), sections, skip, pinned, hovered);
    pump();
  }

  return {
    update,
    dispose() {
      controller.abort();
      if (frame) cancelAnimationFrame(frame);
      for (const timer of timers) clearTimeout(timer);
      delete container.dataset.seatSections;
    },
  };
}
