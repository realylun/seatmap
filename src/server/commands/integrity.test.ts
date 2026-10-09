import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSeats, events } from "@/db/schema";
import { buildListings } from "@/domain/seats/listings";
import {
  addSection,
  DEFAULT_EXTENT,
  buildVenue,
  updateSection,
} from "@/domain/venue/venue-file";
import { STATUS_BY_CODE } from "@/features/seatmap/availability";
import { getAvailability } from "@/server/inventory/availability";
import { createTestDb } from "@/test/pglite";
import {
  assignTierToSections,
  blockSeats,
  blockSections,
  createEvent,
  createTier,
} from "./events";
import { createTemplate, publishVersion } from "./templates";
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
const draftWith = (rowCount: number) =>
  updateSection(
    addSection(
      { extent: DEFAULT_EXTENT, sections: [], selectedId: null },
      ring,
    ),
    "S001",
    { rowCount, seatsPerRow: 4 },
  );

const put = async (p: string) => ({ url: p });

async function ok<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: string }>,
) {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("AC5: events snapshot the template version", () => {
  it("editing the template and publishing v2 leaves the event untouched", async () => {
    const { db } = ctx;
    const venueId = await ok(createVenue(db, { name: "V", city: "C" }));
    const templateId = await ok(
      createTemplate(db, {
        venueId,
        name: "T",
        venueJson: {
          editor: { extent: DEFAULT_EXTENT, sections: draftWith(2).sections },
        },
      }),
    );
    const v1 = await ok(publishVersion(db, put, templateId));
    const event = await ok(
      createEvent(db, async () => buildVenue(draftWith(2)), {
        name: "E",
        slug: "ac5",
        category: "music",
        startsAt: "2030-01-01",
        templateVersionId: v1.id,
      }),
    );
    expect(event.seatCount).toBe(8);

    // edit the draft (3 rows) and publish v2
    const { saveTemplateDraft } = await import("./templates");
    await saveTemplateDraft(db, templateId, {
      extent: DEFAULT_EXTENT,
      sections: draftWith(3).sections,
    });
    const v2 = await ok(publishVersion(db, put, templateId));
    expect(v2).toMatchObject({ version: 2, seatCount: 12 });

    const seats = await db
      .select()
      .from(eventSeats)
      .where(eq(eventSeats.eventId, event.id));
    expect(seats).toHaveLength(8);
    const [row] = await db.select().from(events).where(eq(events.id, event.id));
    expect(row.templateVersionId).toBe(v1.id);
  });
});

describe("AC6: blocked seats are not listed", () => {
  it("excludes blocked seats from listings built on decoded availability", async () => {
    const { db } = ctx;
    const venueId = await ok(createVenue(db, { name: "V2", city: "C" }));
    const templateId = await ok(
      createTemplate(db, {
        venueId,
        name: "T2",
        venueJson: {
          editor: { extent: DEFAULT_EXTENT, sections: draftWith(2).sections },
        },
      }),
    );
    const v1 = await ok(
      publishVersion(db, async (p) => ({ url: p }), templateId),
    );
    const event = await ok(
      createEvent(db, async () => buildVenue(draftWith(2)), {
        name: "E2",
        slug: "ac6",
        category: "music",
        startsAt: "2030-01-01",
        templateVersionId: v1.id,
      }),
    );
    const tierId = await ok(
      createTier(db, event.id, { name: "T", price: 1000, color: "#00ff00" }),
    );
    await assignTierToSections(db, event.id, ["S001"], tierId);

    const listed = async () => {
      const av = await getAvailability(db, event.id);
      const seats = av.seats.map(([sid, tierIdx, code]) => ({
        sid,
        tierId: av.tiers[tierIdx]?.id ?? null,
        price: av.tiers[tierIdx]?.price ?? null,
        status: STATUS_BY_CODE[code],
      }));
      return buildListings(seats).flatMap((l) => l.runs.flatMap((r) => r.sids));
    };
    expect(await listed()).toHaveLength(8);

    await blockSeats(
      db,
      event.id,
      ["1", "2", "3", "4"].map((n) => `S001|A|${n}`),
      true,
    );
    const afterRow = await listed();
    expect(afterRow).toHaveLength(4);
    expect(afterRow.some((sid) => sid.startsWith("S001|A|"))).toBe(false);

    await blockSections(db, event.id, ["S001"], true);
    expect(await listed()).toHaveLength(0);
  });
});
