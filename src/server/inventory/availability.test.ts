import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSeats, priceTiers } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { getAvailability } from "./availability";
import { RECLAIM_GRACE_SECONDS } from "./db";
import { seedEvent } from "./fixtures";
import { getSeatLayout } from "./layout";
import { assignTier } from "./seats";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function setup(count: number) {
  const { db } = ctx;
  const { event, tier } = await seedEvent(db, count);
  const seats = await db
    .select({ id: eventSeats.id })
    .from(eventSeats)
    .where(eq(eventSeats.eventId, event.id));
  const ids = seats.map((s) => s.id).toSorted((a, b) => a - b);
  return { db, event, tier, ids };
}

const sid = (n: number) => `A|1|${n}`;

describe("getAvailability (status-only poll payload)", () => {
  it("returns only non-available seats; holds expired beyond grace read as available", async () => {
    const { db, event, ids } = await setup(6);
    const now = new Date("2030-01-01T00:00:00Z");
    const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);
    const setSeat = (
      id: number,
      values: Partial<typeof eventSeats.$inferInsert>,
    ) => db.update(eventSeats).set(values).where(eq(eventSeats.id, id));
    // seat 1 available; 2 held (active); 3 held, expired but within grace;
    // 4 held, expired beyond grace; 5 sold; 6 blocked
    await setSeat(ids[1], {
      status: "held",
      heldUntil: new Date(now.getTime() + 60_000),
    });
    await setSeat(ids[2], {
      status: "held",
      heldUntil: secondsAgo(RECLAIM_GRACE_SECONDS - 5),
    });
    await setSeat(ids[3], {
      status: "held",
      heldUntil: secondsAgo(RECLAIM_GRACE_SECONDS + 5),
    });
    await setSeat(ids[4], { status: "sold" });
    await setSeat(ids[5], { status: "blocked" });

    const av = await getAvailability(db, event.id, now);
    expect(av.seats.toSorted(([a], [b]) => a.localeCompare(b))).toEqual([
      [sid(2), 1],
      [sid(3), 1],
      [sid(5), 2],
      [sid(6), 3],
    ]);
  });

  it("keeps held seats without held_until and holds exactly at the grace boundary", async () => {
    const { db, event, ids } = await setup(2);
    const now = new Date("2030-01-01T00:00:00Z");
    await db
      .update(eventSeats)
      .set({ status: "held", heldUntil: null })
      .where(eq(eventSeats.id, ids[0]));
    // held_until = now - grace: điều kiện reclaim là "<" (strict) nên vẫn còn giữ
    await db
      .update(eventSeats)
      .set({
        status: "held",
        heldUntil: new Date(now.getTime() - RECLAIM_GRACE_SECONDS * 1000),
      })
      .where(eq(eventSeats.id, ids[1]));
    const av = await getAvailability(db, event.id, now);
    expect(av.seats.toSorted(([a], [b]) => a.localeCompare(b))).toEqual([
      [sid(1), 1],
      [sid(2), 1],
    ]);
  });

  it("is empty when every seat is available", async () => {
    const { db, event } = await setup(3);
    expect(await getAvailability(db, event.id)).toEqual({ seats: [] });
  });
});

describe("getSeatLayout (cached tier layout)", () => {
  it("groups sids by tier (price order) and keeps untiered seats as -1", async () => {
    const { db, event, tier, ids } = await setup(5);
    const [cheap] = await db
      .insert(priceTiers)
      .values({
        eventId: event.id,
        name: "Cheap",
        price: 50_000,
        color: "#0f0",
      })
      .returning();
    await assignTier(db, event.id, ids.slice(0, 2), tier.id);
    await assignTier(db, event.id, [ids[2]], cheap.id);
    // ghế bị chặn vẫn thuộc layout (trạng thái nằm ở payload poll)
    await db
      .update(eventSeats)
      .set({ status: "blocked" })
      .where(
        and(eq(eventSeats.eventId, event.id), inArray(eventSeats.id, [ids[4]])),
      );

    const layout = await getSeatLayout(db, event.id);
    expect(layout.tiers.map((t) => t.id)).toEqual([cheap.id, tier.id]);
    const byIdx = new Map(
      layout.groups.map(([idx, sids]) => [idx, sids.toSorted()]),
    );
    expect(byIdx).toEqual(
      new Map([
        [0, [sid(3)]],
        [1, [sid(1), sid(2)]],
        [-1, [sid(4), sid(5)]],
      ]),
    );
  });

  it("returns empty groups for an event without seats", async () => {
    const { db, event } = await setup(0);
    const layout = await getSeatLayout(db, event.id);
    expect(layout.groups).toEqual([]);
    expect(layout.tiers).toHaveLength(1);
  });
});
