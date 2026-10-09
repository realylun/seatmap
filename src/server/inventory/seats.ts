import { and, eq, inArray } from "drizzle-orm";
import { eventSeats } from "@/db/schema";
import { decodeSid, encodeSid } from "@/domain/seats/seat-id";
import { chunk, type Db } from "./db";

const INSERT_CHUNK = 1000;
const ID_CHUNK = 5000;

export async function snapshotEventSeats(
  db: Db,
  eventId: string,
  seats: readonly { section: string; row: string; seat: string }[],
): Promise<number> {
  for (const part of chunk(seats, INSERT_CHUNK)) {
    await db.insert(eventSeats).values(part.map((s) => ({ eventId, ...s })));
  }
  return seats.length;
}

/** Sets tier on available/blocked seats only. Returns number of rows changed. */
export async function assignTier(
  db: Db,
  eventId: string,
  seatIds: readonly number[],
  tierId: string | null,
): Promise<number> {
  let changed = 0;
  for (const ids of chunk(seatIds, ID_CHUNK)) {
    const rows = await db
      .update(eventSeats)
      .set({ tierId })
      .where(
        and(
          eq(eventSeats.eventId, eventId),
          inArray(eventSeats.id, ids),
          inArray(eventSeats.status, ["available", "blocked"]),
        ),
      )
      .returning({ id: eventSeats.id });
    changed += rows.length;
  }
  return changed;
}

/** Blocks available seats / unblocks blocked seats. Held and sold are untouched. */
export async function setBlocked(
  db: Db,
  eventId: string,
  seatIds: readonly number[],
  blocked: boolean,
): Promise<number> {
  const [from, to] = blocked
    ? (["available", "blocked"] as const)
    : (["blocked", "available"] as const);
  let changed = 0;
  for (const ids of chunk(seatIds, ID_CHUNK)) {
    const rows = await db
      .update(eventSeats)
      .set({ status: to })
      .where(
        and(
          eq(eventSeats.eventId, eventId),
          inArray(eventSeats.id, ids),
          eq(eventSeats.status, from),
        ),
      )
      .returning({ id: eventSeats.id });
    changed += rows.length;
  }
  return changed;
}

/** Seat ids of the given sections within an event. */
export async function seatIdsBySections(
  db: Db,
  eventId: string,
  sections: readonly string[],
): Promise<number[]> {
  if (sections.length === 0) return [];
  const rows = await db
    .select({ id: eventSeats.id })
    .from(eventSeats)
    .where(
      and(
        eq(eventSeats.eventId, eventId),
        inArray(eventSeats.section, [...sections]),
      ),
    );
  return rows.map((r) => r.id);
}

export type SidLookup = { ids: number[]; malformed: number };

function decodeOnce(sids: readonly string[]) {
  const wanted = new Map<string, string>();
  let malformed = 0;
  for (const sid of sids) {
    try {
      const key = decodeSid(sid);
      wanted.set(encodeSid(key), key.section);
    } catch {
      malformed += 1;
    }
  }
  return { wanted, malformed };
}

/**
 * Resolves "section|row|seat" ids to event_seats ids. Malformed sids are counted (not thrown);
 * well-formed sids that match no seat are silently absent from `ids`.
 */
export async function seatIdsBySids(
  db: Db,
  eventId: string,
  sids: readonly string[],
): Promise<SidLookup> {
  const { wanted, malformed } = decodeOnce(sids);
  const sections = [...new Set(wanted.values())];
  if (sections.length === 0) return { ids: [], malformed };
  const rows = await db
    .select({
      id: eventSeats.id,
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
    })
    .from(eventSeats)
    .where(
      and(
        eq(eventSeats.eventId, eventId),
        inArray(eventSeats.section, sections),
      ),
    );
  return {
    ids: rows.filter((r) => wanted.has(encodeSid(r))).map((r) => r.id),
    malformed,
  };
}
