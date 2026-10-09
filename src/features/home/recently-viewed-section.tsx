"use client";

import { useMemo, useSyncExternalStore } from "react";
import { EventGrid } from "@/components/ui/event-card";
import {
  parseRecentlyViewed,
  RECENTLY_VIEWED_KEY,
} from "@/features/home/recently-viewed";
import { readItem, subscribeToStorage } from "@/features/home/storage";

const readRaw = () => readItem(RECENTLY_VIEWED_KEY);
const readServer = () => "";

/** Renders nothing until the visitor has viewed at least one event. */
export function RecentlyViewedSection() {
  const raw = useSyncExternalStore(subscribeToStorage, readRaw, readServer);
  const viewed = useMemo(() => parseRecentlyViewed(raw), [raw]);

  if (viewed.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-heading"
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6"
    >
      <h2 id="recent-heading" className="text-2xl font-bold">
        Recently viewed events
      </h2>
      <div className="mt-6">
        <EventGrid events={viewed} />
      </div>
    </section>
  );
}
