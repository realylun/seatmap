import { and, eq, getTableColumns, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { eventSeats, holds, orderItems, orders, type Order } from "@/db/schema";
import { dbNow, type Db } from "./db";

const confirmSchema = z.object({
  holdId: z.uuid(),
  sessionId: z.string().min(1),
  buyerName: z.string().trim().min(1).max(200),
  buyerEmail: z.email(),
});

export type ConfirmOrderInput = z.input<typeof confirmSchema> & { now?: Date };

export type ConfirmOrderResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "HOLD_NOT_FOUND"
        | "NOT_OWNER"
        | "HOLD_EXPIRED"
        | "HOLD_NOT_ACTIVE"
        | "SEATS_LOST";
    };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type HoldRow = typeof holds.$inferSelect & { expired: boolean };

async function loadHoldForConfirm(
  tx: Tx,
  holdId: string,
  nowExpr: ReturnType<typeof dbNow>,
) {
  const [hold] = await tx
    .select({
      ...getTableColumns(holds),
      expired: sql<boolean>`${holds.expiresAt} <= ${nowExpr}`,
    })
    .from(holds)
    .where(eq(holds.id, holdId))
    .for("update");
  return hold as HoldRow | undefined;
}

/** Seats of the hold that are still ours and carry a price snapshot (charged at held_price). */
async function lockPricedSeats(tx: Tx, holdId: string) {
  return tx
    .select({ id: eventSeats.id, price: sql<number>`${eventSeats.heldPrice}` })
    .from(eventSeats)
    .where(
      and(
        eq(eventSeats.holdId, holdId),
        eq(eventSeats.status, "held"),
        isNotNull(eventSeats.heldPrice),
      ),
    )
    .for("update");
}

async function writeOrder(
  tx: Tx,
  hold: HoldRow,
  seats: readonly { id: number; price: number }[],
  buyer: { buyerName: string; buyerEmail: string },
) {
  const [order] = await tx
    .insert(orders)
    .values({
      eventId: hold.eventId,
      holdId: hold.id,
      ...buyer,
      total: seats.reduce((sum, s) => sum + s.price, 0),
    })
    .returning();
  await tx.insert(orderItems).values(
    seats.map((s) => ({
      orderId: order.id,
      eventSeatId: s.id,
      price: s.price,
    })),
  );
  await tx
    .update(eventSeats)
    .set({ status: "sold", heldUntil: null })
    .where(
      and(
        inArray(
          eventSeats.id,
          seats.map((s) => s.id),
        ),
        eq(eventSeats.holdId, hold.id),
        eq(eventSeats.status, "held"),
      ),
    );
  await tx
    .update(holds)
    .set({ status: "converted" })
    .where(eq(holds.id, hold.id));
  return order;
}

/** Must run on a driver that supports transactions (PGlite, neon-serverless pool). */
export async function confirmOrder(
  db: Db,
  input: ConfirmOrderInput,
): Promise<ConfirmOrderResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const { holdId, sessionId, buyerName, buyerEmail } = parsed.data;
  const nowExpr = dbNow(input.now);

  return db.transaction(async (tx): Promise<ConfirmOrderResult> => {
    const hold = await loadHoldForConfirm(tx, holdId, nowExpr);
    if (!hold) return { ok: false, reason: "HOLD_NOT_FOUND" };
    if (hold.sessionId !== sessionId) return { ok: false, reason: "NOT_OWNER" };

    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.holdId, holdId));
    if (existing) return { ok: true, order: existing };
    if (hold.status !== "active")
      return { ok: false, reason: "HOLD_NOT_ACTIVE" };
    if (hold.expired) return { ok: false, reason: "HOLD_EXPIRED" };

    // Never sell a partial hold: every seat must still be ours and priced.
    const seats = await lockPricedSeats(tx, holdId);
    if (seats.length === 0 || seats.length !== hold.seatCount) {
      return { ok: false, reason: "SEATS_LOST" };
    }
    return {
      ok: true,
      order: await writeOrder(tx, hold, seats, { buyerName, buyerEmail }),
    };
  });
}
