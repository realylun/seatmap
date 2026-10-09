import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eventSeats, templateVersions } from "@/db/schema";
import {
  DEFAULT_EXTENT,
  addSection,
  buildVenue,
  exportFile,
  updateSection,
} from "@/domain/venue/venue-file";
import { createTestDb } from "@/test/pglite";
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
    const putJson = vi.fn(async (path: string) => ({
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
