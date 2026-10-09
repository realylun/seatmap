import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

/** Any drizzle pg database (PGlite in tests, Neon in prod). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const SEAT_STATUS_CODE = {
  available: 0,
  held: 1,
  sold: 2,
  blocked: 3,
} as const;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/** Seats of an expired hold stay protected this long, so a buyer finishing at the boundary can still pay. */
export const RECLAIM_GRACE_SECONDS = 30;

/** Postgres time by default; `now` overrides it (tests). */
export const dbNow = (now?: Date) =>
  now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
