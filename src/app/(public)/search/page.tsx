import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, EventGrid } from "@/components/ui/event-card";
import { currentWeekendRange } from "@/features/home/dates";
import { CardsSkeleton } from "@/features/home/section-skeleton";
import { searchEvents, type EventCategory } from "@/server/queries/home";

export const metadata: Metadata = { title: "Search events" };

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "sports", label: "Sports" },
  { value: "music", label: "Music" },
  { value: "shows", label: "Shows" },
];

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

function parseCategory(v: string | undefined): EventCategory | undefined {
  return CATEGORIES.find((c) => c.value === v)?.value;
}

function hrefFor(q: string, category?: EventCategory, weekend?: boolean) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (category) qs.set("category", category);
  if (weekend) qs.set("when", "weekend");
  const s = qs.toString();
  return s ? `/search?${s}` : "/search";
}

async function Results({
  searchParams,
}: {
  searchParams: PageProps<"/search">["searchParams"];
}) {
  const params = await searchParams;
  await connection();

  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const category = parseCategory(first(params.category));
  const weekend = first(params.when) === "weekend";
  const range = weekend ? currentWeekendRange() : undefined;
  const events = await searchEvents({ q, category, ...range });

  const title = q ? `Results for “${q}”` : "All events";

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <nav
        aria-label="Filter by category"
        className="mt-5 flex flex-wrap gap-2"
      >
        <FilterChip href={hrefFor(q, undefined, weekend)} active={!category}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            href={hrefFor(q, c.value, weekend)}
            active={category === c.value}
          >
            {c.label}
          </FilterChip>
        ))}
        <FilterChip href={hrefFor(q, category, !weekend)} active={weekend}>
          This weekend
        </FilterChip>
      </nav>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {events.length} {events.length === 1 ? "event" : "events"}
      </p>
      <div className="mt-6">
        {events.length === 0 ? (
          <EmptyState
            title="No events match your search"
            hint="Try a different name, venue or city."
          />
        ) : (
          <EventGrid events={events} />
        )}
      </div>
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-white hover:border-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <search className="mb-8 block">
        <form action="/search" className="flex gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search events, venues or cities
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            placeholder="Search events, venues or cities"
            className="min-w-0 flex-1 rounded-lg border border-line px-4 py-3 text-base"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-wine"
          >
            Search
          </button>
        </form>
      </search>
      <Suspense fallback={<CardsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
