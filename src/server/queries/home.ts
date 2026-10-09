import { and, asc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { events, venues } from "@/db/schema";
import type { Db } from "@/server/inventory/db";

export type EventCategory = (typeof events.category.enumValues)[number];

export type EventSummary = {
  id: string;
  slug: string;
  name: string;
  category: EventCategory;
  startsAt: string;
  imageUrl: string | null;
  venueName: string;
  city: string;
};

export type SearchFilters = {
  q?: string;
  category?: EventCategory;
  /** ISO instants, `from` inclusive and `to` exclusive. */
  from?: string;
  to?: string;
};

// Cached lists (cacheLife "minutes") may include events that started within the
// cache window; accepted for this POC.
const TRENDING_LIMIT = 16;
const LIST_LIMIT = 48;

const summaryColumns = {
  id: events.id,
  slug: events.slug,
  name: events.name,
  category: events.category,
  startsAt: events.startsAt,
  imageUrl: events.imageUrl,
  venueName: venues.name,
  city: venues.city,
};

type SummaryRow = Omit<EventSummary, "startsAt"> & { startsAt: Date };

function toSummary(row: SummaryRow): EventSummary {
  return { ...row, startsAt: row.startsAt.toISOString() };
}

const onSaleUpcoming = () =>
  and(eq(events.status, "on_sale"), gte(events.startsAt, sql`now()`));

/** Escape LIKE wildcards so user input matches literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function selectUpcoming(db: Db, where: SQL | undefined, limit: number) {
  return db
    .select(summaryColumns)
    .from(events)
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(where)
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export async function getTrendingEvents(): Promise<EventSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  const rows = await selectUpcoming(
    getDb(),
    and(onSaleUpcoming(), eq(events.isTrending, true)),
    TRENDING_LIMIT,
  );
  return rows.map(toSummary);
}

export async function getCities(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  const rows = await getDb()
    .selectDistinct({ city: venues.city })
    .from(events)
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(onSaleUpcoming())
    .orderBy(asc(venues.city));
  return rows.map((r) => r.city);
}

export async function getEventsByCity(
  city: string,
  from?: string,
  to?: string,
): Promise<EventSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  const rows = await selectUpcoming(
    getDb(),
    and(
      onSaleUpcoming(),
      eq(venues.city, city),
      from ? gte(events.startsAt, new Date(from)) : undefined,
      to ? lt(events.startsAt, new Date(to)) : undefined,
    ),
    LIST_LIMIT,
  );
  return rows.map(toSummary);
}

/**
 * Uncached search, split out so it can run against any pg database in tests.
 * Cached results (cacheLife "minutes") may briefly list events that started
 * within the cache window; that staleness is accepted.
 */
export async function runSearchEvents(
  db: Db,
  filters: SearchFilters,
): Promise<EventSummary[]> {
  const term = filters.q?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : undefined;
  const rows = await selectUpcoming(
    db,
    and(
      onSaleUpcoming(),
      pattern
        ? or(
            ilike(events.name, pattern),
            ilike(venues.name, pattern),
            ilike(venues.city, pattern),
          )
        : undefined,
      filters.category ? eq(events.category, filters.category) : undefined,
      filters.from ? gte(events.startsAt, new Date(filters.from)) : undefined,
      filters.to ? lt(events.startsAt, new Date(filters.to)) : undefined,
    ),
    LIST_LIMIT,
  );
  return rows.map(toSummary);
}

export async function searchEvents(
  filters: SearchFilters,
): Promise<EventSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  return runSearchEvents(getDb(), filters);
}
