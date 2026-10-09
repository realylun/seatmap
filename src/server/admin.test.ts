// Admin actions + uncached queries, end to end on PGlite with Next's request APIs mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addSection,
  DEFAULT_EXTENT,
  buildVenue,
  exportFile,
  updateSection,
} from "@/domain/venue/venue-file";
import { createTestDb } from "@/test/pglite";
import { expectRedirect } from "@/test/next-mocks";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  tags: [] as string[],
}));
vi.mock("@/db/client", () => ({ getDb: () => h.db, getPoolDb: () => h.db }));
vi.mock("next/navigation", async () => {
  const m = await import("@/test/next-mocks");
  return { redirect: m.redirect };
});
vi.mock("next/cache", () => ({ updateTag: (t: string) => h.tags.push(t) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./blob", () => ({
  putJson: async (p: string) => ({ url: `https://blob.test/${p}` }),
}));

const { createVenueAction, updateVenueAction, deleteVenueAction } =
  await import("./actions/venues");
const {
  createTemplateAction,
  publishVersionAction,
  saveTemplateDraftAction,
  setTemplateBackgroundAction,
} = await import("./actions/templates");
const { createEventAction, advanceStatusAction, setTrendingAction } =
  await import("./actions/events");
const tiers = await import("./actions/tiers");
const { assertUuid, isUuid, unwrap } = await import("./actions/form");
const venuesQ = await import("./queries/venues");
const templatesQ = await import("./queries/templates");
const eventsQ = await import("./queries/events");
const ordersQ = await import("./queries/orders");
const { createHold } = await import("./inventory/holds");
const { confirmOrder } = await import("./inventory/orders");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  h.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});

const fd = (o: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const idOf = (url: string) =>
  url
    .split("/")
    .filter((p) => p !== "edit")
    .pop() ?? "";
const ring: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 5],
  [0, 5],
  [0, 0],
];
const draft = updateSection(
  addSection({ extent: DEFAULT_EXTENT, sections: [], selectedId: null }, ring),
  "S001",
  { rowCount: 2, seatsPerRow: 3 },
);
const BAD_ID = "not-a-uuid";

describe("admin flow", () => {
  const state = { venueId: "", templateId: "", eventId: "", tierId: "" };

  it("venues: create, update, validation", async () => {
    const url = await expectRedirect(() =>
      createVenueAction(fd({ name: "Rosetta", city: "HCMC" })),
    );
    state.venueId = idOf(url);
    expect(await venuesQ.getVenue(state.venueId)).toMatchObject({
      name: "Rosetta",
    });
    await expectRedirect(() =>
      updateVenueAction(
        state.venueId,
        fd({ name: "Rosetta 2", city: "HN", address: "x" }),
      ),
    );
    expect((await venuesQ.listVenues()).map((v) => v.name)).toContain(
      "Rosetta 2",
    );
    await expect(
      createVenueAction(fd({ name: "", city: "x" })),
    ).rejects.toThrow();
    await expect(
      updateVenueAction(BAD_ID, fd({ name: "a", city: "b" })),
    ).rejects.toThrow("Invalid id");
    expect(await venuesQ.getVenue(crypto.randomUUID())).toBeNull();
  });

  it("templates: import, bad json, publish, draft, background", async () => {
    const file = new File([JSON.stringify(exportFile(draft))], "venue.json", {
      type: "application/json",
    });
    const url = await expectRedirect(() =>
      createTemplateAction(fd({ venueId: state.venueId, name: "Main", file })),
    );
    state.templateId = idOf(url);
    await expect(
      createTemplateAction(
        fd({
          venueId: state.venueId,
          name: "Bad",
          file: new File(["{nope"], "v.json"),
        }),
      ),
    ).rejects.toThrow("not valid JSON");
    await expectRedirect(() =>
      createTemplateAction(fd({ venueId: state.venueId, name: "Empty" })),
    );

    await expectRedirect(() => publishVersionAction(state.templateId));
    const versions = await templatesQ.listTemplateVersions(state.templateId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ seatCount: 6, sectionCount: 1 });
    await expect(publishVersionAction(BAD_ID)).rejects.toThrow("Invalid id");

    expect(
      await saveTemplateDraftAction(state.templateId, {
        extent: DEFAULT_EXTENT,
        sections: [],
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
    expect((await saveTemplateDraftAction(BAD_ID, {})).ok).toBe(false);
    expect(
      (await saveTemplateDraftAction(state.templateId, { bad: 1 })).ok,
    ).toBe(false);
    expect(
      (
        await setTemplateBackgroundAction(
          state.templateId,
          "https://x.test/a.png",
        )
      ).ok,
    ).toBe(true);
    expect((await setTemplateBackgroundAction(BAD_ID, null)).ok).toBe(false);

    expect((await templatesQ.listTemplates()).length).toBeGreaterThanOrEqual(2);
    expect(await templatesQ.getTemplate(state.templateId)).toMatchObject({
      name: "Main",
    });
    expect(await templatesQ.getTemplate(crypto.randomUUID())).toBeNull();
    expect(await templatesQ.listPublishedVersions()).toHaveLength(1);
  });

  it("events: create, status, trending, tiers, assignment", async () => {
    const [version] = await templatesQ.listPublishedVersions();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(buildVenue(draft)), { status: 200 }),
      ),
    );
    const url = await expectRedirect(() =>
      createEventAction(
        fd({
          name: "Show",
          slug: "show",
          category: "music",
          startsAt: "2030-01-01T19:00",
          templateVersionId: version.id,
          imageUrl: "",
        }),
      ),
    );
    state.eventId = idOf(url);
    expect(h.tags).toContain("events");
    await expect(createEventAction(fd({ name: "x" }))).rejects.toThrow();

    await expectRedirect(() => setTrendingAction(state.eventId, true));
    await expectRedirect(() => advanceStatusAction(state.eventId));
    await expect(advanceStatusAction(BAD_ID)).rejects.toThrow("Invalid id");
    expect(h.tags).toContain(`event:${state.eventId}`);

    await expectRedirect(() =>
      tiers.createTierAction(
        state.eventId,
        fd({ name: "VIP", price: "500000", color: "#ff0000" }),
      ),
    );
    await expect(
      tiers.createTierAction(state.eventId, fd({ name: "", price: "x" })),
    ).rejects.toThrow();
    let detail = await eventsQ.getAdminEvent(state.eventId);
    state.tierId = detail?.tiers[0].id ?? "";
    await expectRedirect(() =>
      tiers.updateTierAction(
        state.eventId,
        state.tierId,
        fd({ name: "VIP", price: "600000", color: "#00ff00" }),
      ),
    );
    await expectRedirect(() =>
      tiers.assignSectionsAction(
        state.eventId,
        fd({ sections: "S001", tierId: state.tierId }),
      ),
    );
    await expectRedirect(() =>
      tiers.blockSectionsAction(state.eventId, true, fd({ sections: "S001" })),
    );
    await expectRedirect(() =>
      tiers.blockSectionsAction(state.eventId, false, fd({ sections: "S001" })),
    );

    const sids = ["S001|A|1", "S001|A|2"];
    expect(await tiers.blockSeatsAction(state.eventId, sids, true)).toEqual({
      ok: true,
      value: { changed: 2, ignored: 0 },
    });
    expect((await tiers.blockSeatsAction(BAD_ID, sids, true)).ok).toBe(false);
    expect(
      (await tiers.assignTierToSeatsAction(state.eventId, sids, BAD_ID)).ok,
    ).toBe(false);
    expect(
      (await tiers.assignTierToSeatsAction(state.eventId, sids, state.tierId))
        .ok,
    ).toBe(true);
    expect(
      (await tiers.assignTierToSeatsAction(state.eventId, [], null)).ok,
    ).toBe(false);

    detail = await eventsQ.getAdminEvent(state.eventId);
    expect(detail?.event.status).toBe("on_sale");
    expect(detail?.event.isTrending).toBe(true);
    expect(detail?.geometryUrl).toContain("blob.test");
    expect(detail?.counts.length).toBeGreaterThan(0);
    expect(await eventsQ.getAdminEvent(crypto.randomUUID())).toBeNull();
    expect((await eventsQ.listEvents()).map((e) => e.slug)).toContain("show");
    vi.unstubAllGlobals();
  });

  it("orders list and tier/venue deletion guards", async () => {
    const { db } = ctx;
    const hold = await createHold(db, {
      eventId: state.eventId,
      seatIds: [],
      sessionId: "s",
    });
    expect(hold.ok).toBe(false);
    const seats = await eventsQ.getAdminEvent(state.eventId);
    expect(seats).not.toBeNull();
    const { eventSeats } = await import("@/db/schema");
    const rows = await db.select({ id: eventSeats.id }).from(eventSeats);
    const held = await createHold(db, {
      eventId: state.eventId,
      seatIds: [rows[2].id],
      sessionId: "s",
    });
    if (!held.ok) throw new Error("hold");
    // tier is in use by a held seat
    await expect(
      tiers.deleteTierAction(state.eventId, state.tierId),
    ).rejects.toThrow("held or sold");
    await confirmOrder(db, {
      holdId: held.holdId,
      sessionId: "s",
      buyerName: "An",
      buyerEmail: "an@example.com",
    });
    const orders = await ordersQ.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ buyerName: "An", total: 600000 });
    expect(orders[0].seats).toHaveLength(1);
    await expect(tiers.deleteTierAction(BAD_ID, BAD_ID)).rejects.toThrow(
      "Invalid id",
    );
    await expect(deleteVenueAction(state.venueId)).rejects.toThrow(
      "still used",
    );
  });

  it("deletes an unused venue and unwraps errors", async () => {
    const url = await expectRedirect(() =>
      createVenueAction(fd({ name: "Tmp", city: "x" })),
    );
    await expectRedirect(() => deleteVenueAction(idOf(url)));
    expect(await venuesQ.getVenue(idOf(url))).toBeNull();
    expect(() => unwrap({ ok: false, error: "boom" })).toThrow("boom");
    expect(() => assertUuid(crypto.randomUUID())).not.toThrow();
    expect(isUuid(1)).toBe(false);
  });
});
