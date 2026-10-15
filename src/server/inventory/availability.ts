import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { eventSeats } from "@/db/schema";
import { RECLAIM_GRACE_SECONDS, SEAT_STATUS_CODE, dbNow, type Db } from "./db";
import { checkedSids, sidsAggSql } from "./seat-sql";

export type Availability = {
  /** [sid, statusCode] — chỉ ghế không trống; ghế vắng mặt = available */
  seats: [string, number][];
};

const NOT_AVAILABLE = ["held", "sold", "blocked"] as const;

/**
 * Trạng thái động (poll): chỉ ghế held/sold/blocked, gom theo status trong Postgres.
 * Hold hết hạn quá RECLAIM_GRACE_SECONDS đọc như available (lazy expiry) nên bị loại.
 */
export async function getAvailability(
  db: Db,
  eventId: string,
  now?: Date,
): Promise<Availability> {
  const reclaimable = sql`${eventSeats.heldUntil} < ${dbNow(now)} - ${RECLAIM_GRACE_SECONDS} * interval '1 second'`;
  const rows = await db
    .select({ status: eventSeats.status, sids: sidsAggSql })
    .from(eventSeats)
    .where(
      and(
        eq(eventSeats.eventId, eventId),
        // IN (...) dùng được event_seats_event_status_idx (event_id, status)
        inArray(eventSeats.status, [...NOT_AVAILABLE]),
        or(
          ne(eventSeats.status, "held"),
          isNull(eventSeats.heldUntil),
          sql`not (${reclaimable})`,
        ),
      ),
    )
    .groupBy(eventSeats.status);
  const seats = rows.flatMap(({ status, sids }) =>
    checkedSids(sids).map((sid): [string, number] => [
      sid,
      SEAT_STATUS_CODE[status],
    ]),
  );
  return { seats };
}
