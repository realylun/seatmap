import { connection } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  eventSeats,
  events,
  priceTiers,
  templateVersions,
  venues,
} from "@/db/schema";

export async function listEvents() {
  await connection();
  return getDb()
    .select({
      id: events.id,
      name: events.name,
      slug: events.slug,
      status: events.status,
      category: events.category,
      startsAt: events.startsAt,
      isTrending: events.isTrending,
      venueName: venues.name,
    })
    .from(events)
    .innerJoin(venues, eq(venues.id, events.venueId))
    .orderBy(desc(events.startsAt));
}

export async function getAdminEvent(id: string) {
  await connection();
  const db = getDb();
  const [row] = await db
    .select({ event: events, geometryUrl: templateVersions.geometryUrl })
    .from(events)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, events.templateVersionId),
    )
    .where(eq(events.id, id));
  if (!row) return null;
  const { event, geometryUrl } = row;
  const [tiers, counts] = await Promise.all([
    db
      .select()
      .from(priceTiers)
      .where(eq(priceTiers.eventId, id))
      .orderBy(asc(priceTiers.price)),
    db
      .select({
        tierId: eventSeats.tierId,
        status: eventSeats.status,
        count: sql<number>`count(*)::int`,
      })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, id))
      .groupBy(eventSeats.tierId, eventSeats.status),
  ]);
  return { event, geometryUrl, tiers, counts };
}
