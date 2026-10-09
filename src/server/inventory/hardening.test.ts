import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  eventSeats,
  events,
  holds,
  orderItems,
  orders,
  priceTiers,
} from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { deleteTier } from "../commands/events";
import { seedEvent } from "./fixtures";
import { createHold, releaseHold } from "./holds";
import { confirmOrder } from "./orders";
import { assignTier } from "./seats";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function setup(count = 4) {
  const { db } = ctx;
  const { event, tier } = await seedEvent(db, count);
  const seats = await db
    .select()
    .from(eventSeats)
    .where(eq(eventSeats.eventId, event.id));
  const ids = seats.map((s) => s.id).toSorted((a, b) => a - b);
  await assignTier(db, event.id, ids, tier.id);
  return { db, event, tier, ids };
}

const buyer = { buyerName: "An", buyerEmail: "an@example.com" };

describe("CR-H1 / CR-H2 confirmOrder integrity", () => {
  it("rejects when a held seat lost its price snapshot, selling nothing", async () => {
    const { db, event, ids } = await setup();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s",
    });
    if (!hold.ok) throw new Error("hold");
    await db
      .update(eventSeats)
      .set({ heldPrice: null })
      .where(eq(eventSeats.id, ids[0]));
    const res = await confirmOrder(db, {
      holdId: hold.holdId,
      sessionId: "s",
      ...buyer,
    });
    expect(res).toEqual({ ok: false, reason: "SEATS_LOST" });
    expect(
      await db.select().from(orders).where(eq(orders.eventId, event.id)),
    ).toHaveLength(0);
    const sold = await db
      .select()
      .from(eventSeats)
      .where(
        and(eq(eventSeats.eventId, event.id), eq(eventSeats.status, "sold")),
      );
    expect(sold).toHaveLength(0);
  });

  it("rejects when one of the hold's seats was reclaimed (partial)", async () => {
    const { db, event, ids } = await setup();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s",
    });
    if (!hold.ok) throw new Error("hold");
    await db
      .update(eventSeats)
      .set({ status: "available", holdId: null, heldUntil: null })
      .where(eq(eventSeats.id, ids[1]));
    const res = await confirmOrder(db, {
      holdId: hold.holdId,
      sessionId: "s",
      ...buyer,
    });
    expect(res.ok).toBe(false);
    expect(
      await db.select().from(orders).where(eq(orders.eventId, event.id)),
    ).toHaveLength(0);
  });

  it("deleteTier refuses while a held/sold seat uses the tier", async () => {
    const { db, event, tier, ids } = await setup();
    await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
    });
    const res = await deleteTier(db, event.id, tier.id);
    expect(res.ok).toBe(false);
  });
});

describe("CR-L1 price snapshot", () => {
  it("charges the price at hold time even if the tier changes later", async () => {
    const { db, event, tier, ids } = await setup();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s",
    });
    if (!hold.ok) throw new Error("hold");
    await db
      .update(priceTiers)
      .set({ price: 999_999 })
      .where(eq(priceTiers.id, tier.id));
    const res = await confirmOrder(db, {
      holdId: hold.holdId,
      sessionId: "s",
      ...buyer,
    });
    if (!res.ok) throw new Error(res.reason);
    expect(res.order.total).toBe(200_000);
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, res.order.id));
    expect(items.map((i) => i.price)).toEqual([100_000, 100_000]);
  });

  it("clears the snapshot on release", async () => {
    const { db, event, ids } = await setup();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
    });
    if (!hold.ok) throw new Error("hold");
    await releaseHold(db, hold.holdId, "s");
    const [seat] = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.id, ids[0]));
    expect(seat.heldPrice).toBeNull();
  });
});

describe("CR-H2 reclaim grace", () => {
  it("keeps just-expired holds protected for 30s", async () => {
    const { db, event, ids } = await setup(1);
    const tenMin = 10 * 60_000;
    await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "a",
      now: new Date(Date.now() - tenMin - 10_000),
    });
    const within = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "b",
    });
    expect(within.ok).toBe(false);
    await db
      .update(eventSeats)
      .set({ heldUntil: new Date(Date.now() - 60_000) })
      .where(eq(eventSeats.id, ids[0]));
    const after = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "b",
    });
    expect(after.ok).toBe(true);
  });
});

describe("CR-M1/M2/M3 createHold atomicity", () => {
  it("allows only one active hold per (event, session) at DB level", async () => {
    const { db, event } = await setup(1);
    const row = {
      eventId: event.id,
      sessionId: "dup",
      expiresAt: new Date(Date.now() + 60_000),
      seatCount: 1,
    };
    await db.insert(holds).values(row);
    await expect(db.insert(holds).values(row)).rejects.toThrow();
  });

  it("keeps the previous hold when the new one fails", async () => {
    const { db, event, ids } = await setup();
    const first = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
    });
    await createHold(db, {
      eventId: event.id,
      seatIds: [ids[1]],
      sessionId: "other",
    });
    const second = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[1]],
      sessionId: "s",
    });
    expect(second.ok).toBe(false);
    if (!first.ok) throw new Error("first");
    const [hold] = await db
      .select()
      .from(holds)
      .where(eq(holds.id, first.holdId));
    expect(hold.status).toBe("active");
    const [seat] = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.id, ids[0]));
    expect(seat.status).toBe("held");
  });

  it("refuses seats of events that are not on sale", async () => {
    const { db, event, ids } = await setup();
    await db
      .update(events)
      .set({ status: "draft" })
      .where(eq(events.id, event.id));
    const res = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "s",
    });
    expect(res.ok).toBe(false);
  });
});

describe("SEC-H1 rate limiting", () => {
  it("refuses an IP that already holds 16 seats", async () => {
    const { db, event, ids } = await setup(20);
    const ip = "203.0.113.7";
    const a = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 8),
      sessionId: "a",
      clientIp: ip,
    });
    const b = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(8, 16),
      sessionId: "b",
      clientIp: ip,
    });
    expect(a.ok && b.ok).toBe(true);
    const c = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(16, 17),
      sessionId: "c",
      clientIp: ip,
    });
    expect(c).toEqual({ ok: false, reason: "RATE_LIMITED" });
    const other = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(16, 17),
      sessionId: "d",
      clientIp: "198.51.100.1",
    });
    expect(other.ok).toBe(true);
  });

  it("refuses an IP that created 20 holds within 10 minutes", async () => {
    const { db, event, ids } = await setup(1);
    const ip = "203.0.113.9";
    for (let i = 0; i < 20; i++) {
      const res = await createHold(db, {
        eventId: event.id,
        seatIds: [ids[0]],
        sessionId: "loop",
        clientIp: ip,
      });
      expect(res.ok).toBe(true);
    }
    const res = await createHold(db, {
      eventId: event.id,
      seatIds: [ids[0]],
      sessionId: "loop",
      clientIp: ip,
    });
    expect(res).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });
});
