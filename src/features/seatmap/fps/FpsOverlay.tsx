"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { type FpsLevel, formatStats } from "./fps-stats";
import { useFpsMeter } from "./use-fps-meter";

const LEVEL_CLASS: Record<FpsLevel, string> = {
  good: "text-emerald-400",
  ok: "text-amber-300",
  poor: "text-red-400",
};

/** Badge FPS góc trái dưới map; luôn hiện cho mọi người dùng */
export function FpsOverlay({
  map,
  eventId,
}: {
  map: MapLibreMap | null;
  eventId: string;
}) {
  const stats = useFpsMeter(map, eventId);
  return (
    <output
      data-testid="fps-overlay"
      data-level={stats?.level ?? "pending"}
      aria-live="off"
      className={`pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs tabular-nums ${stats ? LEVEL_CLASS[stats.level] : "text-white/70"}`}
    >
      {stats ? formatStats(stats) : "-- fps"}
    </output>
  );
}
