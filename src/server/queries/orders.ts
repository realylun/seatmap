import { connection } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { eventSeats, events, orderItems, orders } from "@/db/schema";

export async function listOrders() {
  await connection();
  return getDb()
    .select({
      id: orders.id,
      eventName: events.name,
      buyerName: orders.buyerName,
      buyerEmail: orders.buyerEmail,
      total: orders.total,
      createdAt: orders.createdAt,
      seats: sql<
        string[]
      >`coalesce(array_agg(${eventSeats.section} || ' ' || ${eventSeats.row} || '-' || ${eventSeats.seat}) filter (where ${eventSeats.id} is not null), '{}')`,
    })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(eventSeats, eq(eventSeats.id, orderItems.eventSeatId))
    .groupBy(orders.id, events.name)
    .orderBy(desc(orders.createdAt));
}
