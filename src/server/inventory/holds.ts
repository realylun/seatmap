import { and, count, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { eventSeats, events, holds, priceTiers } from "@/db/schema";
import { RECLAIM_GRACE_SECONDS, dbNow, type Db } from "./db";

export const MAX_HOLD_SEATS = 8;
export const MAX_HELD_SEATS_PER_IP = 16;
export const MAX_HOLDS_PER_IP_WINDOW = 20;
const IP_WINDOW_MINUTES = 10;

const createHoldSchema = z.object({
  eventId: z.uuid(),
  seatIds: z.array(z.number().int().positive()).min(1).max(MAX_HOLD_SEATS),
  sessionId: z.string().min(1),
  ttlMinutes: z.number().positive().default(10),
  clientIp: z.string().min(1).max(64).optional(),
});

export type CreateHoldInput = z.input<typeof createHoldSchema> & {
  now?: Date;
};

export type CreateHoldResult =
  | { ok: true; holdId: string; expiresAt: Date; seatIds: number[] }
  | { ok: false; reason: "INVALID_INPUT" | "RATE_LIMITED" }
  | { ok: false; reason: "SEATS_TAKEN"; takenSeatIds: number[] };

/** Thrown inside the transaction to roll it back (restoring the session's previous hold). */
class HoldRejected extends Error {
  constructor(readonly result: CreateHoldResult) {
    super(result.ok ? "ok" : result.reason);
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (
    let e: unknown = error, i = 0;
    e && i < 5;
    i++, e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

async function releaseSeatsOfHolds(db: Db, holdIds: readonly string[]) {
  if (holdIds.length === 0) return;
  await db
    .update(eventSeats)
    .set({
      status: "available",
      holdId: null,
      heldUntil: null,
      heldPrice: null,
    })
    .where(
      and(inArray(eventSeats.holdId, holdIds), eq(eventSeats.status, "held")),
    );
}

async function assertWithinRateLimit(
  tx: Db,
  eventId: string,
  clientIp: string,
  nowExpr: NowExpr,
) {
  const [heldSeats] = await tx
    .select({ n: count() })
    .from(eventSeats)
    .innerJoin(holds, eq(holds.id, eventSeats.holdId))
    .where(
      and(
        eq(holds.clientIp, clientIp),
        eq(holds.eventId, eventId),
        eq(holds.status, "active"),
        eq(eventSeats.status, "held"),
      ),
    );
  const [recent] = await tx
    .select({ n: count() })
    .from(holds)
    .where(
      and(
        eq(holds.clientIp, clientIp),
        sql`${holds.createdAt} > ${nowExpr} - ${IP_WINDOW_MINUTES} * interval '1 minute'`,
      ),
    );
  if (
    heldSeats.n >= MAX_HELD_SEATS_PER_IP ||
    recent.n >= MAX_HOLDS_PER_IP_WINDOW
  ) {
    throw new HoldRejected({ ok: false, reason: "RATE_LIMITED" });
  }
}

/** Frees the session's previous active hold and its seats; returns how many holds were released. */
async function releaseSessionHolds(tx: Db, eventId: string, sessionId: string) {
  const previous = await tx
    .update(holds)
    .set({ status: "released" })
    .where(
      and(
        eq(holds.eventId, eventId),
        eq(holds.sessionId, sessionId),
        eq(holds.status, "active"),
      ),
    )
    .returning({ id: holds.id });
  await releaseSeatsOfHolds(
    tx,
    previous.map((h) => h.id),
  );
}

type NowExpr = ReturnType<typeof dbNow>;

/** Locks and claims the wanted seats for the hold; returns the ids actually claimed. */
async function claimSeats(
  tx: Db,
  args: {
    eventId: string;
    seatIds: number[];
    hold: { id: string; expiresAt: Date };
    nowExpr: NowExpr;
  },
): Promise<number[]> {
  const { eventId, seatIds, hold, nowExpr } = args;
  const want = tx.$with("want").as(
    tx
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .innerJoin(events, eq(events.id, eventSeats.eventId))
      .where(
        and(
          eq(eventSeats.eventId, eventId),
          eq(events.status, "on_sale"),
          inArray(eventSeats.id, seatIds),
          isNotNull(eventSeats.tierId),
          or(
            eq(eventSeats.status, "available"),
            and(
              eq(eventSeats.status, "held"),
              sql`${eventSeats.heldUntil} < ${nowExpr} - ${RECLAIM_GRACE_SECONDS} * interval '1 second'`,
            ),
          ),
        ),
      )
      .for("update", { of: eventSeats, skipLocked: true }),
  );
  const claimed = await tx
    .with(want)
    .update(eventSeats)
    .set({
      status: "held",
      holdId: hold.id,
      heldUntil: hold.expiresAt,
      heldPrice: sql`(select ${priceTiers.price} from ${priceTiers} where ${priceTiers.id} = ${eventSeats.tierId})`,
    })
    .from(want)
    .where(eq(eventSeats.id, want.id))
    .returning({ id: eventSeats.id });
  return claimed.map((c) => c.id);
}

/**
 * Releases the session's previous hold, then claims the seats, all in one transaction: a failed
 * attempt rolls back and the previous hold survives. Needs a transaction-capable db (pool).
 */
export async function createHold(
  db: Db,
  input: CreateHoldInput,
): Promise<CreateHoldResult> {
  const parsed = createHoldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const { eventId, sessionId, ttlMinutes, clientIp } = parsed.data;
  const seatIds = [...new Set(parsed.data.seatIds)];
  const nowExpr = dbNow(input.now);

  try {
    return await db.transaction(async (tx): Promise<CreateHoldResult> => {
      await releaseSessionHolds(tx, eventId, sessionId);
      if (clientIp) await assertWithinRateLimit(tx, eventId, clientIp, nowExpr);

      const [hold] = await tx
        .insert(holds)
        .values({
          eventId,
          sessionId,
          clientIp,
          seatCount: seatIds.length,
          expiresAt: sql`${nowExpr} + ${ttlMinutes} * interval '1 minute'`,
        })
        .returning({ id: holds.id, expiresAt: holds.expiresAt });

      const claimed = await claimSeats(tx, { eventId, seatIds, hold, nowExpr });
      if (claimed.length < seatIds.length) {
        const got = new Set(claimed);
        throw new HoldRejected({
          ok: false,
          reason: "SEATS_TAKEN",
          takenSeatIds: seatIds.filter((id) => !got.has(id)),
        });
      }
      return {
        ok: true,
        holdId: hold.id,
        expiresAt: hold.expiresAt,
        seatIds: claimed,
      };
    });
  } catch (error) {
    if (error instanceof HoldRejected) return error.result;
    // Two simultaneous requests of one session: the partial unique index lets only one win.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "SEATS_TAKEN", takenSeatIds: seatIds };
    }
    throw error;
  }
}

export async function releaseHold(
  db: Db,
  holdId: string,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const released = await db
    .update(holds)
    .set({ status: "released" })
    .where(
      and(
        eq(holds.id, holdId),
        eq(holds.sessionId, sessionId),
        eq(holds.status, "active"),
      ),
    )
    .returning({ id: holds.id });
  await releaseSeatsOfHolds(
    db,
    released.map((h) => h.id),
  );
  return { ok: released.length > 0 };
}
