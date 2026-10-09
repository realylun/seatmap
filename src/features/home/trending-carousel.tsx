"use client";

import { useState } from "react";
import {
  EmptyState,
  EventCard,
  type EventCardData,
} from "@/components/ui/event-card";
import {
  pageCount,
  pageItems,
  stepPage,
  TRENDING_PER_PAGE,
} from "@/features/home/carousel";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
    </svg>
  );
}

const STEP_BUTTON =
  "grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent";

export function TrendingCarousel({
  events,
}: {
  events: readonly EventCardData[];
}) {
  const [page, setPage] = useState(0);
  const pages = pageCount(events.length, TRENDING_PER_PAGE);
  const visible = pageItems(events, page, TRENDING_PER_PAGE);

  return (
    <section aria-labelledby="trending-heading" className="text-white">
      <div className="flex items-center justify-between">
        <h2 id="trending-heading" className="text-2xl font-bold">
          Trending Events
        </h2>
        {events.length > 0 ? (
          <div className="flex items-center rounded-full border border-white/30">
            <button
              type="button"
              aria-label="Previous trending events"
              disabled={pages === 1}
              className={STEP_BUTTON}
              onClick={() => setPage((p) => stepPage(p, -1, pages))}
            >
              <Chevron dir="left" />
            </button>
            <span className="px-2 text-sm tabular-nums" aria-live="polite">
              {page + 1} of {pages}
            </span>
            <button
              type="button"
              aria-label="Next trending events"
              disabled={pages === 1}
              className={STEP_BUTTON}
              onClick={() => setPage((p) => stepPage(p, 1, pages))}
            >
              <Chevron dir="right" />
            </button>
          </div>
        ) : null}
      </div>

      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            tone="dark"
            title="No trending events yet"
            hint="Check back soon, new events go on sale all the time."
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {visible.map((event, i) => (
            <li key={event.slug} className="min-w-0">
              <EventCard
                event={event}
                tone="dark"
                priority={page === 0 && i < 2}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
