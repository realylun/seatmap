"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAvailability, type DecodedAvailability } from "./availability";

export const POLL_INTERVAL_MS = 15_000;

type State = {
  readonly data: DecodedAvailability | null;
  readonly error: string | null;
};

/**
 * Availability ghế: tải ngay, poll 15s, tải lại khi tab được focus.
 * `refresh(true)` sau thao tác hold: thêm query cache-busting để bỏ qua cache CDN ngắn của route.
 */
export function useAvailability(eventId: string) {
  const [state, setState] = useState<State>({ data: null, error: null });
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async (fresh = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const query = fresh ? `?fresh=${Date.now()}` : "";
        const res = await fetch(`/api/events/${eventId}/availability${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = decodeAvailability(await res.json());
        setState({ data, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("availability fetch failed", error);
        setState((s) => ({ ...s, error: "Could not load seat availability." }));
      }
    },
    [eventId],
  );

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  return { ...state, refresh };
}
