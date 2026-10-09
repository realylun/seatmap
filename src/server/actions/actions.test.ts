import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eventSeats, events, holds } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/session";
import { createRequestContext, expectRedirect } from "@/test/next-mocks";
import { createTestDb } from "@/test/pglite";
import { seedEvent } from "../inventory/fixtures";
import type { createHold as CreateHold } from "../inventory/holds";
import { assignTier } from "../inventory/seats";

const state = vi.hoisted(() => ({
  db: null as unknown,
  request: null as unknown,
  createHold: null as null | ((...args: unknown[]) => unknown),
  failDb: false,
}));

vi.mock("next/headers", async () => {
  const { createRequestContext: create } = await import("@/test/next-mocks");
  const request = create();
  state.request = request;
  return { cookies: request.cookies, headers: request.headers };
});
vi.mock("next/navigation", async () => {
  const { redirect } = await import("@/test/next-mocks");
  return { redirect };
});
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => {
  const get = () => {
    if (state.failDb) throw new Error("db down");
    return state.db;
  };
  return { getDb: get, getPoolDb: get };
});
vi.mock("../inventory/holds", async (importOriginal) => {
  const real = await importOriginal<typeof import("../inventory/holds")>();
  return {
    ...real,
    createHold: (...args: Parameters<typeof CreateHold>) =>
      state.createHold ? state.createHold(...args) : real.createHold(...args),
  };
});

const { createHoldAction, releaseHoldAction } = await import("./holds");
const { confirmOrderAction } = await import("./orders");
const request = state.request as ReturnType<typeof createRequestContext>;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  state.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(() => {
  request.reset();
  state.createHold = null;
  state.failDb = false;
});

async function setup() {
  const { db } = ctx;
  const { event, tier } = await seedEvent(db, 4);
  const seats = await db
    .select()
    .from(eventSeats)
    .where(eq(eventSeats.eventId, event.id));
  await assignTier(
    db,
    event.id,
    seats.map((s) => s.id),
    tier.id,
  );
  return { db, event };
}

const sid = () => request.jar.get(SESSION_COOKIE)?.value;

async function holdAs(eventId: string, sids: string[]) {
  const url = await expectRedirect(() => createHoldAction(eventId, sids));
  return url.replace("/checkout/", "");
}

describe("createHoldAction", () => {
  it("rejects invalid input before touching the db", async () => {
    expect(await createHoldAction("nope", ["A|1|1"])).toMatchObject({
      reason: "INVALID_INPUT",
    });
    const id = crypto.randomUUID();
    expect(await createHoldAction(id, [])).toMatchObject({
      reason: "INVALID_INPUT",
    });
    expect(await createHoldAction(id, ["bad"])).toMatchObject({
      reason: "INVALID_INPUT",
    });
    expect(await createHoldAction(id, [`${"x".repeat(70)}|1|1`])).toMatchObject(
      { reason: "INVALID_INPUT" },
    );
  });

  it("refuses events that are not on sale", async () => {
    const { db, event } = await setup();
    await db
      .update(events)
      .set({ status: "ended" })
      .where(eq(events.id, event.id));
    expect(await createHoldAction(event.id, ["A|1|1"])).toMatchObject({
      reason: "NOT_ON_SALE",
    });
  });

  it("reports unknown seats as taken", async () => {
    const { event } = await setup();
    expect(await createHoldAction(event.id, ["A|1|1", "Z|1|1"])).toMatchObject({
      reason: "SEATS_TAKEN",
      takenSids: ["Z|1|1"],
    });
  });

  it("sets the session cookie, passes the client ip and redirects to checkout", async () => {
    const { db, event } = await setup();
    request.headerValues.set("x-forwarded-for", " 203.0.113.9 , 10.0.0.1");
    const holdId = await holdAs(event.id, ["A|1|1", "A|1|2"]);
    expect(holdId).toMatch(/^[0-9a-f-]{36}$/);
    const [hold] = await db.select().from(holds).where(eq(holds.id, holdId));
    expect(hold.sessionId).toBe(sid());
    expect(hold.clientIp).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", async () => {
    const { db, event } = await setup();
    request.headerValues.set("x-real-ip", "198.51.100.7");
    const holdId = await holdAs(event.id, ["A|1|1"]);
    const [hold] = await db.select().from(holds).where(eq(holds.id, holdId));
    expect(hold.clientIp).toBe("198.51.100.7");
  });

  it("maps seats taken by another session to their sids", async () => {
    const { event } = await setup();
    await holdAs(event.id, ["A|1|2"]);
    request.reset(); // another browser
    expect(await createHoldAction(event.id, ["A|1|1", "A|1|2"])).toMatchObject({
      reason: "SEATS_TAKEN",
      takenSids: ["A|1|2"],
    });
  });

  it("maps RATE_LIMITED and inventory INVALID_INPUT", async () => {
    const { event } = await setup();
    state.createHold = async () => ({ ok: false, reason: "RATE_LIMITED" });
    expect(await createHoldAction(event.id, ["A|1|1"])).toMatchObject({
      reason: "RATE_LIMITED",
      message: expect.stringContaining("Too many"),
    });
    state.createHold = async () => ({ ok: false, reason: "INVALID_INPUT" });
    expect(await createHoldAction(event.id, ["A|1|1"])).toMatchObject({
      reason: "INVALID_INPUT",
    });
  });

  it("returns a generic error when the db fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.failDb = true;
    expect(
      await createHoldAction(crypto.randomUUID(), ["A|1|1"]),
    ).toMatchObject({ reason: "ERROR" });
  });
});

describe("releaseHoldAction", () => {
  it("redirects home for bad or unknown holds", async () => {
    expect(await expectRedirect(() => releaseHoldAction("bad"))).toBe("/");
    expect(
      await expectRedirect(() => releaseHoldAction(crypto.randomUUID())),
    ).toBe("/");
  });

  it("releases the owner's hold and returns to the event", async () => {
    const { db, event } = await setup();
    const holdId = await holdAs(event.id, ["A|1|1"]);
    expect(await expectRedirect(() => releaseHoldAction(holdId))).toBe(
      `/events/${event.slug}`,
    );
    const [hold] = await db.select().from(holds).where(eq(holds.id, holdId));
    expect(hold.status).toBe("released");
  });
});

const form = (buyerName: string, buyerEmail: string) => {
  const data = new FormData();
  data.set("buyerName", buyerName);
  data.set("buyerEmail", buyerEmail);
  return data;
};

describe("confirmOrderAction", () => {
  it("returns field errors without calling the db", async () => {
    const result = await confirmOrderAction(
      crypto.randomUUID(),
      {},
      form(" ", "bad"),
    );
    expect(result.fieldErrors?.buyerName).toBeTruthy();
    expect(result.fieldErrors?.buyerEmail).toBeTruthy();
    expect(result.values).toEqual({ buyerName: " ", buyerEmail: "bad" });
    expect(await confirmOrderAction("x", {}, new FormData())).toMatchObject({
      values: { buyerName: "", buyerEmail: "" },
    });
  });

  it("closes the form without a session or for a foreign hold", async () => {
    expect(
      await confirmOrderAction(
        crypto.randomUUID(),
        {},
        form("An", "an@example.com"),
      ),
    ).toMatchObject({
      closed: true,
    });
    request.jar.set(SESSION_COOKIE, { value: crypto.randomUUID() });
    expect(
      await confirmOrderAction(
        crypto.randomUUID(),
        {},
        form("An", "an@example.com"),
      ),
    ).toMatchObject({
      closed: true,
      message: "This hold does not exist.",
    });
  });

  it("keeps the form open when the inventory rejects input", async () => {
    request.jar.set(SESSION_COOKIE, { value: crypto.randomUUID() });
    expect(
      await confirmOrderAction("not-a-uuid", {}, form("An", "an@example.com")),
    ).toMatchObject({
      closed: false,
      message: "Please check your details.",
    });
  });

  it("pays the hold and redirects to the order", async () => {
    const { event } = await setup();
    const holdId = await holdAs(event.id, ["A|1|3"]);
    const url = await expectRedirect(() =>
      confirmOrderAction(holdId, {}, form("An", "an@example.com")),
    );
    expect(url).toMatch(/^\/orders\/[0-9a-f-]{36}$/);
  });

  it("reports a failure when the db is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    request.jar.set(SESSION_COOKIE, { value: crypto.randomUUID() });
    state.failDb = true;
    expect(
      await confirmOrderAction(
        crypto.randomUUID(),
        {},
        form("An", "an@example.com"),
      ),
    ).toMatchObject({
      message: expect.stringContaining("could not be completed"),
    });
  });
});
