import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templates } from "@/db/schema";
import {
  DEFAULT_EXTENT,
  addSection,
  updateSection,
} from "@/domain/venue/venue-file";
import { seedEvent } from "@/server/inventory/fixtures";
import { releaseHold } from "@/server/inventory/holds";
import { createTestDb } from "@/test/pglite";
import {
  advanceEventStatus,
  assignTierToSections,
  createEvent,
  createTier,
  deleteTier,
  updateTier,
} from "./events";
import { createTemplate, publishVersion, saveTemplateDraft } from "./templates";
import { createVenue, deleteVenue, updateVenue } from "./venues";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

const missing = () => crypto.randomUUID();
const valid = (templateVersionId: string) => ({
  name: "E",
  slug: "e-err",
  category: "music",
  startsAt: "2030-01-01",
  templateVersionId,
});

const loader = async () => {
  throw new Error("must not load");
};

const put = async (p: string) => ({ url: p });

async function venue() {
  const r = await createVenue(ctx.db, { name: "V", city: "C", address: "" });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("venue command errors", () => {
  it("rejects invalid input, unknown ids and referenced deletes", async () => {
    const { db } = ctx;
    expect((await createVenue(db, { name: "", city: "x" })).ok).toBe(false);
    expect(
      (await updateVenue(db, missing(), { name: "a", city: "b" })).ok,
    ).toBe(false);
    expect((await updateVenue(db, missing(), {})).ok).toBe(false);
    const id = await venue();
    await createTemplate(db, { venueId: id, name: "T" });
    expect(await deleteVenue(db, id)).toEqual({
      ok: false,
      error: "Venue is still used by templates or events",
    });
  });
});

describe("template command errors", () => {
  it("validates create and publish preconditions", async () => {
    const { db } = ctx;
    const venueId = await venue();
    expect((await createTemplate(db, { venueId: "x", name: "T" })).ok).toBe(
      false,
    );
    expect(
      (await createTemplate(db, { venueId, name: "T", venueJson: 5 })).ok,
    ).toBe(false);

    expect((await publishVersion(db, put, missing())).ok).toBe(false);

    const t = await createTemplate(db, { venueId, name: "T" });
    if (!t.ok) throw new Error(t.error);
    await db
      .update(templates)
      .set({ editorState: { nope: 1 } })
      .where(eq(templates.id, t.value));
    expect(await publishVersion(db, put, t.value)).toEqual({
      ok: false,
      error: "Template draft is invalid",
    });

    const noSeats = updateSection(
      addSection({ extent: DEFAULT_EXTENT, sections: [], selectedId: null }, [
        [0, 0],
        [10, 0],
        [10, 5],
        [0, 5],
        [0, 0],
      ]),
      "S001",
      { rowCount: 0 },
    );
    expect(
      (
        await saveTemplateDraft(db, t.value, {
          extent: DEFAULT_EXTENT,
          sections: noSeats.sections,
        })
      ).ok,
    ).toBe(true);
    expect(await publishVersion(db, put, t.value)).toEqual({
      ok: false,
      error: "Template has no seats",
    });
  });
});

describe("event command errors", () => {
  it("rejects unknown template versions and bad input", async () => {
    const { db } = ctx;
    expect(await createEvent(db, loader, valid(missing()))).toEqual({
      ok: false,
      error: "Template version not found",
    });
    expect((await createEvent(db, loader, { name: "" })).ok).toBe(false);
    expect((await advanceEventStatus(db, missing())).ok).toBe(false);
  });

  it("validates tiers and clears or protects assignments", async () => {
    const { db } = ctx;
    const { event, tier } = await seedEvent(db, 2);
    expect(
      (await createTier(db, event.id, { name: "", price: -1, color: "red" }))
        .ok,
    ).toBe(false);
    expect((await updateTier(db, event.id, tier.id, { name: "" })).ok).toBe(
      false,
    );
    expect(
      (
        await updateTier(db, event.id, tier.id, {
          name: "N",
          price: 5,
          color: "#00ff00",
        })
      ).ok,
    ).toBe(true);

    expect(await assignTierToSections(db, event.id, ["A"], missing())).toBe(0);
    expect(await assignTierToSections(db, event.id, ["A"], tier.id)).toBe(2);
    expect(await assignTierToSections(db, event.id, ["A"], null)).toBe(2);
    expect(await deleteTier(db, event.id, tier.id)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("releaseHold ignores unknown holds", async () => {
    expect(await releaseHold(ctx.db, missing(), "s")).toEqual({ ok: false });
  });
});
