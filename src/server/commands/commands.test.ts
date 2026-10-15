import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eventSeats, events, holds, templateVersions } from "@/db/schema";
import {
  DEFAULT_EXTENT,
  addSection,
  buildVenue,
  exportFile,
  updateSection,
} from "@/domain/venue/venue-file";
import { medianSeatSpacing } from "@/domain/venue/seat-spacing";
import { venueSchema } from "@/domain/venue/types";
import { createTestDb } from "@/test/pglite";
import type { PutJson } from "../blob";
import {
  assignTierToSeats,
  blockSeats,
  createEvent,
  eventInputSchema,
  advanceEventStatus,
  assignTierToSections,
  blockSections,
  createTier,
  parseSectionList,
  rebindEventVersion,
} from "./events";
import {
  createTemplate,
  publishVersion,
  saveTemplateDraft,
  setTemplateBackground,
} from "./templates";
import { createVenue } from "./venues";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

const ring: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 5],
  [0, 5],
  [0, 0],
];
const draft = (() => {
  const s0 = addSection(
    { extent: DEFAULT_EXTENT, sections: [], selectedId: null },
    ring,
  );
  return updateSection(s0, "S001", { rowCount: 3, seatsPerRow: 4 });
})();

async function setupTemplate() {
  const { db } = ctx;
  const venue = await createVenue(db, { name: "Rosetta", city: "HCMC" });
  if (!venue.ok) throw new Error(venue.error);
  const tpl = await createTemplate(db, {
    venueId: venue.value,
    name: "Main",
    venueJson: exportFile(draft),
  });
  if (!tpl.ok) throw new Error(tpl.error);
  return { venueId: venue.value, templateId: tpl.value };
}

describe("templates", () => {
  it("rejects venue.json without editor block", async () => {
    const venue = await createVenue(ctx.db, { name: "X", city: "Y" });
    if (!venue.ok) throw new Error("venue");
    const res = await createTemplate(ctx.db, {
      venueId: venue.value,
      name: "T",
      venueJson: {},
    });
    expect(res.ok).toBe(false);
  });

  it("publishVersion uploads geometry and records counts, versions increment", async () => {
    const { templateId } = await setupTemplate();
    const putJson = vi.fn<PutJson>(async (path) => ({
      url: `https://blob.test/${path}`,
    }));
    const v1 = await publishVersion(ctx.db, putJson, templateId);
    const v2 = await publishVersion(ctx.db, putJson, templateId);
    expect(v1).toMatchObject({
      ok: true,
      value: { version: 1, seatCount: 12, sectionCount: 1 },
    });
    expect(v2).toMatchObject({ ok: true, value: { version: 2 } });
    expect(putJson.mock.calls[0][0]).toBe(`geometry/${templateId}/v1.json`);
    // seatSpacing tính sẵn để client không phải đo lại (~0,6 s với venue 135k ghế); đo lại trên
    // toạ độ đã làm tròn 6 chữ số nên chỉ so tới 5 chữ số
    const uploaded = venueSchema.parse(JSON.parse(putJson.mock.calls[0][1]));
    expect(uploaded.seatSpacing).toBeCloseTo(
      medianSeatSpacing(uploaded.geojson.seats),
      5,
    );
    const rows = await ctx.db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId));
    expect(rows).toHaveLength(2);
  });

  it("refuses to publish an empty template", async () => {
    const venue = await createVenue(ctx.db, { name: "E", city: "E" });
    if (!venue.ok) throw new Error("venue");
    const tpl = await createTemplate(ctx.db, {
      venueId: venue.value,
      name: "Empty",
    });
    if (!tpl.ok) throw new Error("tpl");
    const res = await publishVersion(ctx.db, vi.fn(), tpl.value);
    expect(res.ok).toBe(false);
  });
});

describe("events", () => {
  it("createEvent snapshots all seats; tiers/sections/status flow", async () => {
    const { db } = ctx;
    const { templateId } = await setupTemplate();
    const pub = await publishVersion(db, async (p) => ({ url: p }), templateId);
    if (!pub.ok) throw new Error(pub.error);
    const geometry = buildVenue(draft);
    const res = await createEvent(db, async () => geometry, {
      name: "Show",
      slug: "show-1",
      category: "music",
      startsAt: "2026-12-01T19:00",
      templateVersionId: pub.value.id,
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.value.seatCount).toBe(12);
    const seats = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.eventId, res.value.id));
    expect(seats).toHaveLength(12);

    const bad = await createEvent(db, async () => geometry, {
      name: "x",
      slug: "Bad Slug",
      category: "music",
      startsAt: "2026-12-01",
      templateVersionId: pub.value.id,
    });
    expect(bad.ok).toBe(false);

    const tier = await createTier(db, res.value.id, {
      name: "VIP",
      price: 500000,
      color: "#ff0000",
    });
    if (!tier.ok) throw new Error(tier.error);
    expect(
      await assignTierToSections(
        db,
        res.value.id,
        parseSectionList("S001, S404"),
        tier.value,
      ),
    ).toBe(12);
    expect(await blockSections(db, res.value.id, ["S001"], true)).toBe(12);
    const blocked = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.status, "blocked"));
    expect(blocked.length).toBeGreaterThanOrEqual(12);

    expect(await advanceEventStatus(db, res.value.id)).toEqual({
      ok: true,
      value: "on_sale",
    });
    expect(await advanceEventStatus(db, res.value.id)).toEqual({
      ok: true,
      value: "ended",
    });
    expect((await advanceEventStatus(db, res.value.id)).ok).toBe(false);
  });
});

const putUrl = async (p: string) => ({ url: p });
// v2 geometry: section S001 (3x4) + S002 (2x5) = 22 seats
const draft2 = (() => {
  const s1 = addSection(draft, [
    [20, 0],
    [30, 0],
    [30, 5],
    [20, 5],
    [20, 0],
  ]);
  return updateSection(s1, "S002", { rowCount: 2, seatsPerRow: 5 });
})();
const loadV1 = async () => buildVenue(draft);
const loadV2 = async () => buildVenue(draft2);

async function setupRebind(slug: string) {
  const { db } = ctx;
  const { templateId } = await setupTemplate();
  const v1 = await publishVersion(db, putUrl, templateId);
  const v2 = await publishVersion(db, putUrl, templateId);
  if (!v1.ok || !v2.ok) throw new Error("publish");
  const ev = await createEvent(db, loadV1, {
    name: slug,
    slug,
    category: "music",
    startsAt: "2030-01-01",
    templateVersionId: v1.value.id,
  });
  if (!ev.ok) throw new Error(ev.error);
  return { eventId: ev.value.id, v1: v1.value.id, v2: v2.value.id };
}
const seatsOf = (eventId: string) =>
  ctx.db.select().from(eventSeats).where(eq(eventSeats.eventId, eventId));

describe("rebindEventVersion", () => {
  it("replaces seats and updates the version", async () => {
    const { eventId, v2 } = await setupRebind("rebind-ok");
    const tier = await createTier(ctx.db, eventId, {
      name: "VIP",
      price: 1,
      color: "#ff0000",
    });
    if (!tier.ok) throw new Error(tier.error);
    await assignTierToSections(ctx.db, eventId, ["S001"], tier.value);

    const res = await rebindEventVersion(ctx.db, loadV2, eventId, v2);
    expect(res).toEqual({ ok: true, value: { seatCount: 22 } });
    const seats = await seatsOf(eventId);
    expect(seats).toHaveLength(22);
    expect(seats.every((s) => s.tierId === null)).toBe(true);
    const [ev] = await ctx.db
      .select({ v: events.templateVersionId })
      .from(events)
      .where(eq(events.id, eventId));
    expect(ev.v).toBe(v2);
  });

  it("refuses the same version, foreign venue and bad ids", async () => {
    const { eventId, v1 } = await setupRebind("rebind-same");
    const same = await rebindEventVersion(ctx.db, loadV2, eventId, v1);
    expect(same.ok).toBe(false);

    const other = await setupRebind("rebind-other");
    const foreign = await rebindEventVersion(ctx.db, loadV2, eventId, other.v2);
    expect(foreign.ok).toBe(false);
    expect(await seatsOf(eventId)).toHaveLength(12);

    expect((await rebindEventVersion(ctx.db, loadV2, "x", v1)).ok).toBe(false);
    expect(
      (await rebindEventVersion(ctx.db, loadV2, crypto.randomUUID(), v1)).ok,
    ).toBe(false);
    expect(
      (await rebindEventVersion(ctx.db, loadV2, eventId, crypto.randomUUID()))
        .ok,
    ).toBe(false);
  });

  it("refuses when a seat is sold or held", async () => {
    for (const status of ["sold", "held"] as const) {
      const { eventId, v2 } = await setupRebind(`rebind-${status}`);
      const [seat] = await seatsOf(eventId);
      await ctx.db
        .update(eventSeats)
        .set({ status })
        .where(eq(eventSeats.id, seat.id));
      const res = await rebindEventVersion(ctx.db, loadV2, eventId, v2);
      expect(res.ok).toBe(false);
      expect(await seatsOf(eventId)).toHaveLength(12);
    }
  });

  it("refuses when the event has a hold (any status)", async () => {
    const { eventId, v2 } = await setupRebind("rebind-hold");
    await ctx.db.insert(holds).values({
      eventId,
      sessionId: "s",
      expiresAt: new Date(0),
      status: "released",
    });
    const res = await rebindEventVersion(ctx.db, loadV2, eventId, v2);
    expect(res.ok).toBe(false);
    expect(await seatsOf(eventId)).toHaveLength(12);
  });
});

describe("draft saving", () => {
  it("saves a valid draft and rejects invalid/unknown", async () => {
    const { templateId } = await setupTemplate();
    expect(
      (
        await saveTemplateDraft(ctx.db, templateId, {
          extent: DEFAULT_EXTENT,
          sections: [],
        })
      ).ok,
    ).toBe(true);
    expect((await saveTemplateDraft(ctx.db, templateId, { nope: 1 })).ok).toBe(
      false,
    );
    expect(
      (
        await saveTemplateDraft(ctx.db, crypto.randomUUID(), {
          extent: DEFAULT_EXTENT,
          sections: [],
        })
      ).ok,
    ).toBe(false);
    expect(
      (await setTemplateBackground(ctx.db, templateId, "https://x.test/a.png"))
        .ok,
    ).toBe(true);
    expect(
      (await setTemplateBackground(ctx.db, templateId, "javascript:alert(1)"))
        .ok,
    ).toBe(false);
    expect((await setTemplateBackground(ctx.db, templateId, null)).ok).toBe(
      true,
    );
  });
});

describe("map-based assignment", () => {
  it("assigns and blocks by sid, ignoring unknown sids and foreign tiers", async () => {
    const { db } = ctx;
    const { templateId } = await setupTemplate();
    const pub = await publishVersion(db, async (p) => ({ url: p }), templateId);
    if (!pub.ok) throw new Error(pub.error);
    const mk = async (slug: string) => {
      const r = await createEvent(db, async () => buildVenue(draft), {
        name: slug,
        slug,
        category: "music",
        startsAt: "2030-01-01",
        templateVersionId: pub.value.id,
      });
      if (!r.ok) throw new Error(r.error);
      return r.value.id;
    };
    const [e1, e2] = [await mk("map-a"), await mk("map-b")];
    const tier = await createTier(db, e1, {
      name: "T",
      price: 1,
      color: "#00ff00",
    });
    const other = await createTier(db, e2, {
      name: "T",
      price: 1,
      color: "#00ff00",
    });
    if (!tier.ok || !other.ok) throw new Error("tier");
    const sids = ["S001|A|1", "S001|A|2", "nope", "S001|Z|99"];
    // "nope" is malformed (ignored), "S001|Z|99" is well-formed but unknown (silently absent)
    expect(await assignTierToSeats(db, e1, sids, tier.value)).toEqual({
      ok: true,
      value: { changed: 2, ignored: 1 },
    });
    expect(await assignTierToSeats(db, e1, sids, other.value)).toEqual({
      ok: false,
      error: "Tier not found",
    });
    expect(await blockSeats(db, e1, sids, true)).toEqual({
      ok: true,
      value: { changed: 2, ignored: 1 },
    });
    expect(await blockSeats(db, e1, sids, false)).toEqual({
      ok: true,
      value: { changed: 2, ignored: 1 },
    });
    expect((await blockSeats(db, e1, [], true)).ok).toBe(false);
  });
});

describe("input hardening", () => {
  it("restricts event image hosts (SEC-M2)", () => {
    const base = {
      name: "n",
      slug: "n",
      category: "music",
      startsAt: "2030-01-01",
      templateVersionId: crypto.randomUUID(),
    };
    const parse = (imageUrl: string) =>
      eventInputSchema.safeParse({ ...base, imageUrl });
    expect(
      parse("https://abc.public.blob.vercel-storage.com/events/a.png").success,
    ).toBe(true);
    expect(parse("https://picsum.photos/seed/x/400").success).toBe(true);
    expect(parse("https://evil.example/a.png").success).toBe(false);
    expect(parse("http://picsum.photos/a.png").success).toBe(false);
    expect(parse("javascript:alert(1)").success).toBe(false);
    const empty = parse("");
    expect(empty.success && empty.data.imageUrl).toBe(null);
  });

  it("rejects over-long sids (SEC-L3)", async () => {
    const res = await blockSeats(
      ctx.db,
      crypto.randomUUID(),
      ["x".repeat(65)],
      true,
    );
    expect(res.ok).toBe(false);
  });
});
