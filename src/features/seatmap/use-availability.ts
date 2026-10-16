"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DecodedAvailability } from "./availability";
import { createAvailabilityLoader } from "./availability-loader";
import { pollWhileVisible } from "./poll";

export const POLL_INTERVAL_MS = 15_000;

type State = {
  readonly eventId: string;
  readonly data: DecodedAvailability | null;
  readonly error: string | null;
};

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Availability ghế = layout (tier của mọi ghế) + status (chỉ ghế không trống, poll 15s khi tab
 * đang hiển thị; tải lại ngay khi tab hiện lại / được focus). Layout tải lại (URL CDN cache được)
 * khi tab hiện lại sau khi ẩn và khi cũ hơn LAYOUT_MAX_AGE_MS.
 * `refresh(true)` sau thao tác hold: thêm query cache-busting để bỏ qua cache CDN ngắn của route.
 * `refresh(true, true)` sau khi admin gán tier: tải lại cả layout, bỏ qua CDN.
 */
export function useAvailability(eventId: string) {
  const [state, setState] = useState<State>({
    eventId,
    data: null,
    error: null,
  });
  const loader = useMemo(
    () =>
      createAvailabilityLoader({
        eventId,
        fetchJson,
        // poll không đổi trả lại đúng object cũ → giữ state, không render lại
        onData: (data) =>
          setState((s) =>
            s.eventId === eventId && s.data === data && s.error === null
              ? s
              : { eventId, data, error: null },
          ),
        onError: (error) => {
          console.error("availability fetch failed", error);
          setState((s) => ({
            eventId,
            data: s.eventId === eventId ? s.data : null,
            error: "Could not load seat availability.",
          }));
        },
      }),
    [eventId],
  );

  const refresh = useCallback(
    (fresh = false, reloadLayout = false) =>
      loader.refresh(fresh, reloadLayout),
    [loader],
  );

  useEffect(() => {
    const stop = pollWhileVisible(({ resumed }) => {
      if (resumed) loader.markLayoutStale();
      void loader.refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      stop();
      loader.abort();
    };
  }, [loader]);

  // đổi event: không trả dữ liệu của event cũ
  const current = state.eventId === eventId;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    refresh,
  };
}
