import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSeats, orderItems, orders } from "@/db/schema";
import { seedEvent } from "@/server/inventory/fixtures";
import { assignTier } from "@/server/inventory/seats";
import { createTestDb } from "@/test/pglite";
import { loadSaleSeats, sellGroups } from "./sell";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

describe("sellGroups", () => {
  it("buys each group through hold + order and marks the seats sold", async () => {
    const { db } = ctx;
    const { event, tier } = await seedEvent(db, 10);
    const all = await db
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, event.id));
    const ids = all.map((s) => s.id).toSorted((a, b) => a - b);
    await assignTier(db, event.id, ids.slice(0, 8), tier.id);

    const saleSeats = await loadSaleSeats(db, event.id);
    expect(saleSeats).toHaveLength(8); // untiered seats are not for sale
    expect(saleSeats.every((s) => s.tierRank === 0)).toBe(true);
    expect(saleSeats.every((s) => s.available)).toBe(true);

    const result = await sellGroups(db, event.id, [ids.slice(0, 3), [ids[4]]]);
    expect(result).toEqual({ orders: 2, seats: 4, failed: 0 });

    const sold = await db
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .where(eq(eventSeats.status, "sold"));
    expect(sold.map((s) => s.id).toSorted((a, b) => a - b)).toEqual([
      ...ids.slice(0, 3),
      ids[4],
    ]);
    const made = await db
      .select()
      .from(orders)
      .where(eq(orders.eventId, event.id));
    expect(made.map((o) => o.total).toSorted((a, b) => a - b)).toEqual([
      100_000, 300_000,
    ]);
    expect(await db.select().from(orderItems)).toHaveLength(4);
    const after = await loadSaleSeats(db, event.id);
    expect(after.filter((s) => !s.available)).toHaveLength(4); // sold seats stay in the plan input
  });

  it("counts a group as failed when its seats are already sold", async () => {
    const { db } = ctx;
    const { event, tier } = await seedEvent(db, 2);
    const all = await db
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, event.id));
    const ids = all.map((s) => s.id);
    await assignTier(db, event.id, ids, tier.id);

    await sellGroups(db, event.id, [ids]);
    expect(await sellGroups(db, event.id, [ids])).toEqual({
      orders: 0,
      seats: 0,
      failed: 1,
    });
  });
});
