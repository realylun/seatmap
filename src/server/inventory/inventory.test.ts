import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSeats, orders } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { getAvailability } from "./availability";
import { seedEvent } from "./fixtures";
import { createHold, releaseHold } from "./holds";
import { confirmOrder } from "./orders";
import { assignTier, setBlocked } from "./seats";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function setup(count = 4, tiered = true) {
  const { db } = ctx;
  const { event, tier } = await seedEvent(db, count);
  const seats = await db
    .select()
    .from(eventSeats)
    .where(eq(eventSeats.eventId, event.id));
  const ids = seats.map((s) => s.id).toSorted((a, b) => a - b);
  if (tiered) await assignTier(db, event.id, ids, tier.id);
  return { db, event, tier, ids };
}

describe("assignTier / setBlocked (AC6)", () => {
  it("ignores held and sold seats", async () => {
    const { db, event, tier, ids } = await setup(4, false);
    await assignTier(db, event.id, ids, tier.id);
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s1",
    });
    expect(hold.ok).toBe(true);
    expect(await assignTier(db, event.id, ids, null)).toBe(3);
    expect(await setBlocked(db, event.id, ids, true)).toBe(3);
    const rows = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.id, ids[0]));
    expect(rows[0].status).toBe("held");
    expect(rows[0].tierId).toBe(tier.id);
    expect(await setBlocked(db, event.id, ids, false)).toBe(3);
  });
});

describe("createHold", () => {
  it("validates 1-8 seats", async () => {
    const { db, event, ids } = await setup(10);
    expect(
      await createHold(db, { eventId: event.id, seatIds: [], sessionId: "s" }),
    ).toEqual({
      ok: false,
      reason: "INVALID_INPUT",
    });
    const nine = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 9),
      sessionId: "s",
    });
    expect(nine).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });

  it("rejects seats without tier and releases partial claims", async () => {
    const { db, event, tier, ids } = await setup(3, false);
    await assignTier(db, event.id, [ids[0]], tier.id);
    const res = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s",
    });
    expect(res).toEqual({
      ok: false,
      reason: "SEATS_TAKEN",
      takenSeatIds: [ids[1]],
    });
    const first = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.id, ids[0]));
    expect(first[0].status).toBe("available");
  });

  it("releases the session's previous hold", async () => {
    const { db, event, ids } = await setup();
    const a = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
    });
    const b = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[1]],
      sessionId: "s",
    });
    expect(a.ok && b.ok).toBe(true);
    const rows = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.id, ids[0]));
    expect(rows[0].status).toBe("available");
  });

  it("20 parallel holds on one seat: exactly one wins (AC15)", async () => {
    const { db, event, ids } = await setup(1);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createHold(db, {
          eventId: event.id,
          seatIds: [ids[0]],
          sessionId: `s${i}`,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("expired hold is reclaimable (AC14)", async () => {
    const { db, event, ids } = await setup(1);
    const past = new Date(Date.now() - 3_600_000);
    await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "a",
      now: past,
    });
    const av = await getAvailability(db, event.id);
    expect(av.seats[0][2]).toBe(0);
    const b = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "b",
    });
    expect(b.ok).toBe(true);
  });
});

describe("confirmOrder", () => {
  const buyer = { buyerName: "An", buyerEmail: "an@example.com" };

  it("creates one order, marks seats sold, is idempotent (AC16)", async () => {
    const { db, event, ids } = await setup();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s",
    });
    if (!hold.ok) throw new Error("hold failed");
    const [r1, r2] = await Promise.all([
      confirmOrder(db, { holdId: hold.holdId, sessionId: "s", ...buyer }),
      confirmOrder(db, { holdId: hold.holdId, sessionId: "s", ...buyer }),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    const all = await db
      .select()
      .from(orders)
      .where(eq(orders.eventId, event.id));
    expect(all).toHaveLength(1);
    expect(all[0].total).toBe(200_000);
    const av = await getAvailability(db, event.id);
    expect(av.seats.filter((s) => s[2] === 2)).toHaveLength(2);
    expect(await releaseHold(db, hold.holdId, "s")).toEqual({ ok: false });
  });

  it("rejects expired hold, wrong owner, bad email", async () => {
    const { db, event, ids } = await setup();
    const past = new Date(Date.now() - 3_600_000);
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
      now: past,
    });
    if (!hold.ok) throw new Error("hold failed");
    expect(
      await confirmOrder(db, { holdId: hold.holdId, sessionId: "s", ...buyer }),
    ).toEqual({
      ok: false,
      reason: "HOLD_EXPIRED",
    });
    expect(
      await confirmOrder(db, { holdId: hold.holdId, sessionId: "x", ...buyer }),
    ).toEqual({
      ok: false,
      reason: "NOT_OWNER",
    });
    expect(
      await confirmOrder(db, {
        holdId: hold.holdId,
        sessionId: "s",
        buyerName: "A",
        buyerEmail: "bad",
      }),
    ).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });
});
