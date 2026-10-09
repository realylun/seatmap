import {
  events,
  priceTiers,
  templateVersions,
  templates,
  venues,
} from "@/db/schema";
import type { Db } from "./db";
import { snapshotEventSeats } from "./seats";

/** Test fixture: event with one tier and `count` seats in section A row 1. */
export async function seedEvent(db: Db, count = 4) {
  const [venue] = await db
    .insert(venues)
    .values({ name: "V", city: "C" })
    .returning();
  const [tpl] = await db
    .insert(templates)
    .values({ venueId: venue.id, name: "T" })
    .returning();
  const [ver] = await db
    .insert(templateVersions)
    .values({
      templateId: tpl.id,
      version: 1,
      geometryUrl: "u",
      sectionCount: 1,
      seatCount: count,
    })
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      slug: `e-${crypto.randomUUID()}`,
      name: "E",
      category: "music",
      startsAt: new Date(),
      venueId: venue.id,
      templateVersionId: ver.id,
      status: "on_sale",
    })
    .returning();
  const [tier] = await db
    .insert(priceTiers)
    .values({ eventId: event.id, name: "Gen", price: 100_000, color: "#f00" })
    .returning();
  await snapshotEventSeats(
    db,
    event.id,
    Array.from({ length: count }, (_, i) => ({
      section: "A",
      row: "1",
      seat: String(i + 1),
    })),
  );
  return { venue, template: tpl, version: ver, event, tier };
}
