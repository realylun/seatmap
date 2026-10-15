import {
  mergeAvailability,
  parseLayout,
  parseStatus,
  type DecodedAvailability,
  type LayoutPayload,
} from "./availability";

/** Layout cũ hơn mức này được tải lại (URL thường, CDN cache được) ở lần refresh kế tiếp */
export const LAYOUT_MAX_AGE_MS = 5 * 60_000;

type FetchJson = (url: string, signal: AbortSignal) => Promise<unknown>;

type Options = {
  readonly eventId: string;
  readonly fetchJson: FetchJson;
  readonly onData: (data: DecodedAvailability) => void;
  readonly onError: (error: unknown) => void;
  readonly now?: () => number;
};

/** "fresh" = bỏ qua CDN (admin vừa sửa tier); "cdn" = tải lại qua URL cache được */
type LayoutReload = "none" | "cdn" | "fresh";

/**
 * Nạp availability = layout (giữ trong closure) + status (mỗi lần refresh). Request mới abort request cũ.
 * Cờ tải lại layout sống qua abort: chỉ xoá khi layout được tải thành công.
 */
export function createAvailabilityLoader({
  eventId,
  fetchJson,
  onData,
  onError,
  now = Date.now,
}: Options) {
  const base = `/api/events/${eventId}`;
  let layout: { payload: LayoutPayload; loadedAt: number } | null = null;
  let reload: LayoutReload = "none";
  let controller: AbortController | null = null;

  const markLayoutStale = (mode: "cdn" | "fresh" = "cdn") => {
    if (reload !== "fresh") reload = mode;
  };

  /** `reloaded` = cờ reload lúc bắt đầu tải (null nếu dùng layout đang giữ) */
  const loadLayout = async (
    signal: AbortSignal,
    freshQuery: string,
  ): Promise<{ payload: LayoutPayload; reloaded: LayoutReload | null }> => {
    const expired = layout && now() - layout.loadedAt >= LAYOUT_MAX_AGE_MS;
    if (layout && reload === "none" && !expired)
      return { payload: layout.payload, reloaded: null };
    const reloaded = reload;
    const query = reloaded === "fresh" ? freshQuery : "";
    const json = await fetchJson(`${base}/layout${query}`, signal);
    return { payload: parseLayout(json), reloaded };
  };

  const refresh = async (fresh = false, reloadLayout = false) => {
    if (reloadLayout) markLayoutStale("fresh");
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const freshQuery = `?fresh=${now()}`;
    try {
      const [loaded, status] = await Promise.all([
        loadLayout(current.signal, freshQuery),
        fetchJson(
          `${base}/availability${fresh ? freshQuery : ""}`,
          current.signal,
        ).then(parseStatus),
      ]);
      if (current.signal.aborted) return;
      if (loaded.reloaded !== null) {
        layout = { payload: loaded.payload, loadedAt: now() };
        // chỉ xoá cờ nếu không có yêu cầu reload mới hơn trong lúc tải
        if (reload === loaded.reloaded) reload = "none";
      }
      onData(mergeAvailability(loaded.payload, status));
    } catch (error) {
      if (current.signal.aborted) return;
      onError(error);
    }
  };

  const abort = () => controller?.abort();

  return { refresh, markLayoutStale, abort };
}
