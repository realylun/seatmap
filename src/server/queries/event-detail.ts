import { and, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import {
  eventSeats,
  events,
  holds,
  orderItems,
  orders,
  priceTiers,
  templateVersions,
  venues,
} from "@/db/schema";
import { decodeSid } from "@/domain/seats/seat-id";

export type EventStatus = (typeof events.status.enumValues)[number];

export type EventDetail = {
  id: string;
  slug: string;
  name: string;
  status: EventStatus;
  startsAt: string;
  imageUrl: string | null;
  venueName: string;
  city: string;
  geometryUrl: string;
};

/** Thông tin tĩnh của event (không gồm trạng thái ghế). Tag `event:<id>` khớp admin updateTag. */
export async function getEventBySlug(
  slug: string,
): Promise<EventDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");
  const [row] = await getDb()
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      status: events.status,
      startsAt: events.startsAt,
      imageUrl: events.imageUrl,
      venueName: venues.name,
      city: venues.city,
      geometryUrl: templateVersions.geometryUrl,
    })
    .from(events)
    .innerJoin(venues, eq(venues.id, events.venueId))
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, events.templateVersionId),
    )
    .where(eq(events.slug, slug));
  if (!row) return null;
  cacheTag(`event:${row.id}`);
  return { ...row, startsAt: row.startsAt.toISOString() };
}

/** Trạng thái hiện tại (không cache) — kiểm tra trước khi giữ ghế */
export async function getEventSaleInfo(eventId: string) {
  const [row] = await getDb()
    .select({ status: events.status, slug: events.slug })
    .from(events)
    .where(eq(events.id, eventId));
  return row ?? null;
}

/** sid ("section|row|seat") → event_seats.id; sid không tồn tại bị bỏ qua */
export async function resolveSeatIds(
  eventId: string,
  sids: readonly string[],
): Promise<Map<string, number>> {
  if (sids.length === 0) return new Map();
  const conditions = sids.map((sid): SQL | undefined => {
    const { section, row, seat } = decodeSid(sid);
    return and(
      eq(eventSeats.section, section),
      eq(eventSeats.row, row),
      eq(eventSeats.seat, seat),
    );
  });
  const rows = await getDb()
    .select({
      id: eventSeats.id,
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
    })
    .from(eventSeats)
    .where(and(eq(eventSeats.eventId, eventId), or(...conditions)));
  return new Map(rows.map((r) => [`${r.section}|${r.row}|${r.seat}`, r.id]));
}

export type SeatLine = {
  section: string;
  row: string;
  seat: string;
  price: number;
  tierName: string;
};

const eventColumns = {
  eventId: events.id,
  eventSlug: events.slug,
  eventName: events.name,
  startsAt: events.startsAt,
  venueName: venues.name,
  city: venues.city,
};

/** Hold + event + ghế đang giữ, để trang checkout kiểm tra chủ sở hữu và hạn */
export async function getHoldSummary(holdId: string) {
  const db = getDb();
  const [hold] = await db
    .select({
      id: holds.id,
      sessionId: holds.sessionId,
      status: holds.status,
      expiresAt: holds.expiresAt,
      ...eventColumns,
    })
    .from(holds)
    .innerJoin(events, eq(events.id, holds.eventId))
    .innerJoin(venues, eq(venues.id, events.venueId))
    .where(eq(holds.id, holdId));
  if (!hold) return null;
  const seats: SeatLine[] = await db
    .select({
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
      // giá chốt lúc giữ ghế (held_price) — đúng số tiền confirmOrder sẽ thu
      price: sql<number>`${eventSeats.heldPrice}`,
      tierName: sql<string>`coalesce(${priceTiers.name}, '')`,
    })
    .from(eventSeats)
    .leftJoin(priceTiers, eq(priceTiers.id, eventSeats.tierId))
    .where(
      and(
        eq(eventSeats.holdId, holdId),
        eq(eventSeats.status, "held"),
        isNotNull(eventSeats.heldPrice),
      ),
    );
  return { ...hold, seats };
}

export type HoldSummary = NonNullable<
  Awaited<ReturnType<typeof getHoldSummary>>
>;

/** Order + ghế đã mua + session của hold gốc (chỉ hiển thị khi sid khớp) */
export async function getOrderSummary(orderId: string) {
  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      buyerName: orders.buyerName,
      buyerEmail: orders.buyerEmail,
      total: orders.total,
      createdAt: orders.createdAt,
      sessionId: holds.sessionId,
      ...eventColumns,
    })
    .from(orders)
    .innerJoin(holds, eq(holds.id, orders.holdId))
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(venues, eq(venues.id, events.venueId))
    .where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db
    .select({
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
      price: orderItems.price,
    })
    .from(orderItems)
    .innerJoin(eventSeats, eq(eventSeats.id, orderItems.eventSeatId))
    .where(eq(orderItems.orderId, orderId));
  return { ...order, items };
}
