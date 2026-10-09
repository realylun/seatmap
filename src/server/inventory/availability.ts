import { asc, eq } from "drizzle-orm";
import { eventSeats, priceTiers } from "@/db/schema";
import { encodeSid } from "@/domain/seats/seat-id";
import { RECLAIM_GRACE_SECONDS, SEAT_STATUS_CODE, type Db } from "./db";

export type Availability = {
  tiers: { id: string; name: string; price: number; color: string }[];
  /** [sid, tierIdx or -1, statusCode] */
  seats: [string, number, number][];
};

/** Expired holds read as available (lazy expiry). */
export async function getAvailability(
  db: Db,
  eventId: string,
  now: Date = new Date(),
): Promise<Availability> {
  const tiers = await db
    .select({
      id: priceTiers.id,
      name: priceTiers.name,
      price: priceTiers.price,
      color: priceTiers.color,
    })
    .from(priceTiers)
    .where(eq(priceTiers.eventId, eventId))
    .orderBy(asc(priceTiers.price), asc(priceTiers.id));
  const tierIdx = new Map(tiers.map((t, i) => [t.id, i]));

  const rows = await db
    .select({
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
      tierId: eventSeats.tierId,
      status: eventSeats.status,
      heldUntil: eventSeats.heldUntil,
    })
    .from(eventSeats)
    .where(eq(eventSeats.eventId, eventId));

  const seats = rows.map((r): [string, number, number] => {
    const expired =
      r.status === "held" &&
      r.heldUntil !== null &&
      r.heldUntil.getTime() < now.getTime() - RECLAIM_GRACE_SECONDS * 1000;
    const status = expired ? "available" : r.status;
    return [
      encodeSid(r),
      r.tierId ? (tierIdx.get(r.tierId) ?? -1) : -1,
      SEAT_STATUS_CODE[status],
    ];
  });
  return { tiers, seats };
}
