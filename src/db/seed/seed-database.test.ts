import { readFileSync } from "node:fs";
import { count, eq, isNull, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  eventSeats,
  events,
  priceTiers,
  templateVersions,
  templates,
} from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { SEED_EVENTS, SEED_TIERS } from "./data";
import {
  hashString,
  planTierSections,
  seedDatabase,
  seededRandom,
  startsAt,
  type SeedDeps,
} from "./seed-database";

const readVenue = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../data/venues/${name}`, import.meta.url),
      "utf8",
    ),
  );

describe("helper thuần", () => {
  it("seededRandom lặp lại được, trong [0,1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 5 }, () => a());
    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("planTierSections: phủ đủ section, gần tâm → tier 0", () => {
    const sections = Array.from({ length: 40 }, (_, i) => ({
      id: `S${i}`,
      center: [i + 1, 0] as [number, number],
    }));
    const plan = planTierSections(sections, 4, hashString("x"));
    expect(plan.flat().toSorted()).toEqual(
      sections.map((s) => s.id).toSorted(),
    );
    // jitter ±1 tier nhưng trung bình khoảng cách vẫn tăng dần theo tier
    const meanIndex = plan.map(
      (ids) => ids.reduce((n, id) => n + Number(id.slice(1)), 0) / ids.length,
    );
    expect(meanIndex).toEqual(meanIndex.toSorted((a, b) => a - b));
    expect(planTierSections(sections, 4, hashString("x"))).toEqual(plan);
  });

  it("startsAt: 19:30 giờ VN, đúng số ngày", () => {
    const at = startsAt(new Date("2026-10-09T03:00:00Z"), 5);
    expect(at.toISOString()).toBe("2026-10-14T12:30:00.000Z");
  });
});

describe("seedDatabase trên PGlite", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  const uploads: string[] = [];
  const deps: SeedDeps = {
    putJson: async (pathname) => {
      uploads.push(pathname);
      return { url: `https://blob.test/${pathname}` };
    },
    venueFiles: {
      rosetta: readVenue("venue.rosetta.json"),
      sample: readVenue("venue.sample.json"),
    },
    backgroundUrls: { rosetta: "https://blob.test/bg.png" },
    now: new Date("2026-10-09T00:00:00Z"),
  };

  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.client.close();
  });

  it(
    "tạo 2 version, 8 event on_sale (5 trending), ghế = 8 × seatCount, chạy lại vẫn vậy",
    { timeout: 120_000 },
    async () => {
      await seedDatabase(ctx.db, deps); // lần 1 → lần 2 phải truncate sạch
      const summary = await seedDatabase(ctx.db, deps);
      const { db } = ctx;
      const seatCount = Object.fromEntries(
        summary.versions.map((v) => [v.map, v.seatCount]),
      );
      expect(seatCount).toEqual({ rosetta: 10278, sample: 1313 });
      expect(summary.versions.map((v) => v.sectionCount)).toEqual([95, 3]);
      const expectedSeats = SEED_EVENTS.reduce(
        (n, e) => n + seatCount[e.venue],
        0,
      );
      expect(summary.seats).toBe(expectedSeats);

      const [{ value: eventRows }] = await db
        .select({ value: count() })
        .from(events);
      const [{ value: seatRows }] = await db
        .select({ value: count() })
        .from(eventSeats);
      const [{ value: versionRows }] = await db
        .select({ value: count() })
        .from(templateVersions);
      expect([eventRows, seatRows, versionRows]).toEqual([8, expectedSeats, 2]);
      expect(uploads.at(-1)).toMatch(/^geometry\/.+\/v1\.json$/);

      const rows = await db.select().from(events);
      expect(rows.every((e) => e.status === "on_sale" && e.imageUrl)).toBe(
        true,
      );
      expect(rows.filter((e) => e.isTrending)).toHaveLength(5);
      const [bg] = await db
        .select()
        .from(templates)
        .where(eq(templates.name, "Rosetta — sơ đồ chuẩn"));
      expect(bg.backgroundImageUrl).toBe("https://blob.test/bg.png");
    },
  );

  it("mỗi event có đủ tier, mọi ghế đã gán tier", async () => {
    const { db } = ctx;
    const [{ value: tierRows }] = await db
      .select({ value: count() })
      .from(priceTiers);
    expect(tierRows).toBe(
      SEED_EVENTS.reduce((n, e) => n + SEED_TIERS[e.category].length, 0),
    );
    expect(await db.$count(eventSeats, isNull(eventSeats.tierId))).toBe(0);
    expect(
      await db.$count(eventSeats, ne(eventSeats.status, "available")),
    ).toBe(0);
  });
});
