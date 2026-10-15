import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eventSeats, events } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { seedEvent } from "../inventory/fixtures";
import { createHold } from "../inventory/holds";
import { confirmOrder } from "../inventory/orders";
import { assignTier } from "../inventory/seats";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({
  getDb: () => holder.db,
  getPoolDb: () => holder.db,
}));

const queries = await import("./event-detail");
const { getCachedSeatLayout } = await import("./seat-layout");
const { cacheTag } = await import("next/cache");

let ctx: TestDb;
beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});

async function setup() {
  const { db } = ctx;
  const { event, tier } = await seedEvent(db, 3);
  const seats = await db
    .select()
    .from(eventSeats)
    .where(eq(eventSeats.eventId, event.id));
  const ids = seats.map((s) => s.id).toSorted((a, b) => a - b);
  await assignTier(db, event.id, ids, tier.id);
  return { db, event, tier, ids };
}

describe("getEventBySlug", () => {
  it("returns detail with geometry url and tags the event", async () => {
    const { event } = await setup();
    const detail = await queries.getEventBySlug(event.slug);
    expect(detail).toMatchObject({
      id: event.id,
      slug: event.slug,
      status: "on_sale",
      venueName: "V",
      city: "C",
      geometryUrl: "u",
      startsAt: event.startsAt.toISOString(),
    });
    expect(cacheTag).toHaveBeenCalledWith(`event:${event.id}`);
    expect(await queries.getEventBySlug("missing")).toBeNull();
  });
});

describe("getEventSaleInfo / resolveSeatIds", () => {
  it("reads current status", async () => {
    const { db, event } = await setup();
    await db
      .update(events)
      .set({ status: "ended" })
      .where(eq(events.id, event.id));
    expect(await queries.getEventSaleInfo(event.id)).toEqual({
      status: "ended",
      slug: event.slug,
    });
    expect(await queries.getEventSaleInfo(crypto.randomUUID())).toBeNull();
  });

  it("maps known sids to ids and skips unknown ones", async () => {
    const { event, ids } = await setup();
    expect(await queries.resolveSeatIds(event.id, [])).toEqual(new Map());
    const map = await queries.resolveSeatIds(event.id, [
      "A|1|1",
      "A|1|3",
      "Z|9|9",
    ]);
    expect(map).toEqual(
      new Map([
        ["A|1|1", ids[0]],
        ["A|1|3", ids[2]],
      ]),
    );
  });
});

describe("getHoldSummary / getOrderSummary", () => {
  it("returns held seats at the held price, then the paid order", async () => {
    const { db, event, ids } = await setup();
    expect(await queries.getHoldSummary(crypto.randomUUID())).toBeNull();
    const hold = await createHold(db, {
      eventId: event.id,
      seatIds: ids.slice(0, 2),
      sessionId: "s1",
    });
    if (!hold.ok) throw new Error("hold failed");

    const summary = await queries.getHoldSummary(hold.holdId);
    expect(summary).toMatchObject({
      id: hold.holdId,
      sessionId: "s1",
      status: "active",
      eventSlug: event.slug,
    });
    expect(
      summary?.seats.map((s) => [s.seat, s.price, s.tierName]).toSorted(),
    ).toEqual([
      ["1", 100_000, "Gen"],
      ["2", 100_000, "Gen"],
    ]);

    const paid = await confirmOrder(db, {
      holdId: hold.holdId,
      sessionId: "s1",
      buyerName: "An",
      buyerEmail: "an@example.com",
    });
    if (!paid.ok) throw new Error("confirm failed");
    const order = await queries.getOrderSummary(paid.order.id);
    expect(order).toMatchObject({
      id: paid.order.id,
      total: 200_000,
      sessionId: "s1",
      eventName: "E",
    });
    expect(order?.items).toHaveLength(2);
    expect(await queries.getOrderSummary(crypto.randomUUID())).toBeNull();
  });
});

describe("getCachedSeatLayout", () => {
  it("tags the event so admin tier edits (updateTag event:<id>) invalidate it", async () => {
    const { event, tier } = await setup();
    const layout = await getCachedSeatLayout(event.id);
    expect(layout.tiers.map((t) => t.id)).toEqual([tier.id]);
    expect(layout.groups).toEqual([[0, ["A|1|1", "A|1|2", "A|1|3"]]]);
    expect(cacheTag).toHaveBeenCalledWith(`event:${event.id}`);
  });
});
