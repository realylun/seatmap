import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Impl = (eventId: string) => Promise<unknown>;
const h = vi.hoisted(() => ({
  impl: null as Impl | null,
  calls: [] as string[],
}));
vi.mock("@/server/queries/seat-layout", () => ({
  getCachedSeatLayout: (eventId: string) => {
    h.calls.push(eventId);
    if (!h.impl) throw new Error("no impl");
    return h.impl(eventId);
  },
}));

const { GET } = await import("./route");

const call = (id: string) =>
  GET(new NextRequest(`http://localhost/api/events/${id}/layout`), {
    params: Promise.resolve({ id }),
  });
const EVENT_ID = "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f";

describe("GET /api/events/[id]/layout", () => {
  beforeEach(() => {
    h.impl = null;
    h.calls = [];
  });

  it("rejects a non-uuid id with 400 no-store", async () => {
    const res = await call("nope");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(h.calls).toEqual([]);
  });

  it("returns the layout with a CDN-cacheable header", async () => {
    const layout = { tiers: [], groups: [[-1, ["A|1|1"]]] };
    h.impl = async () => layout;
    const res = await call(EVENT_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=60",
    );
    expect(await res.json()).toEqual(layout);
    expect(h.calls).toEqual([EVENT_ID]);
  });

  it("returns 500 no-store when the query fails", async () => {
    h.impl = async () => {
      throw new Error("db down");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call(EVENT_ID);
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
