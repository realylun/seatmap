import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/pglite";
import {
  eventSeats,
  events,
  templateVersions,
  templates,
  venues,
} from "./schema";

describe("schema", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.client.close();
  });

  it("inserts a venue and rejects duplicate (event, section, row, seat)", async () => {
    const { db } = ctx;
    const [venue] = await db
      .insert(venues)
      .values({ name: "Rosetta", city: "HCMC" })
      .returning();
    expect(venue.name).toBe("Rosetta");

    const [template] = await db
      .insert(templates)
      .values({ venueId: venue.id, name: "Main" })
      .returning();
    const [version] = await db
      .insert(templateVersions)
      .values({
        templateId: template.id,
        version: 1,
        geometryUrl: "https://example.test/g.json",
        sectionCount: 1,
        seatCount: 1,
      })
      .returning();
    const [event] = await db
      .insert(events)
      .values({
        slug: "e1",
        name: "E1",
        category: "music",
        startsAt: new Date(),
        venueId: venue.id,
        templateVersionId: version.id,
      })
      .returning();

    const seat = { eventId: event.id, section: "A", row: "1", seat: "1" };
    await db.insert(eventSeats).values(seat);
    await expect(db.insert(eventSeats).values(seat)).rejects.toThrow();
  });
});
