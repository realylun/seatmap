import { eq } from "drizzle-orm";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPoolDb, isLocalDatabaseUrl } from "@/db/client";
import {
  eventSeats,
  events,
  templateVersions,
  templates,
  venues,
} from "@/db/schema";
import { seedEvent } from "./fixtures";
import { createHold } from "./holds";
import { assignTier } from "./seats";

const url = process.env.DATABASE_URL_TEST;

// AC15 on a real Postgres (local docker or Neon branch): true concurrent connections, not PGlite's single one.
describe.skipIf(!url)("createHold contention on a real Postgres", () => {
  const db = createPoolDb(url ?? "");
  let fixture: Awaited<ReturnType<typeof seedEvent>>;

  beforeAll(async () => {
    const migrationsFolder = fileURLToPath(
      new URL("../../db/migrations", import.meta.url),
    );
    // the same factory the app uses: node-postgres locally, Neon WebSocket otherwise
    if (isLocalDatabaseUrl(url ?? ""))
      await migratePg(db as never, { migrationsFolder });
    else await migrateNeon(db as never, { migrationsFolder });
    fixture = await seedEvent(db, 1);
    const [seat] = await db
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, fixture.event.id));
    await assignTier(db, fixture.event.id, [seat.id], fixture.tier.id);
  });

  afterAll(async () => {
    if (fixture) {
      await db.delete(events).where(eq(events.id, fixture.event.id));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, fixture.version.id));
      await db.delete(templates).where(eq(templates.id, fixture.template.id));
      await db.delete(venues).where(eq(venues.id, fixture.venue.id));
    }
    await db.$client.end();
  });

  it("20 concurrent holds on one seat: exactly one wins", async () => {
    const [seat] = await db
      .select({ id: eventSeats.id })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, fixture.event.id));
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createHold(db, {
          eventId: fixture.event.id,
          seatIds: [seat.id],
          sessionId: `s${i}`,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  }, 30_000);
});
