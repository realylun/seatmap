import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { events, templateVersions, templates, venues } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import {
  escapeLike,
  getCities,
  getEventsByCity,
  getTrendingEvents,
  runSearchEvents,
  searchEvents,
} from "./home";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({
  getDb: () => holder.db,
  getPoolDb: () => holder.db,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;

const HOUR = 3_600_000;
const future = (h: number) => new Date(Date.now() + h * HOUR);

async function seedVenue(name: string, city: string) {
  const { db } = ctx;
  const [venue] = await db.insert(venues).values({ name, city }).returning();
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
      seatCount: 1,
    })
    .returning();
  return { venue, ver };
}

async function seedEvents() {
  const { db } = ctx;
  const rosetta = await seedVenue("Rosetta Hall", "Hanoi");
  const arena = await seedVenue("Big Arena", "Saigon");
  const base = (v: typeof rosetta) => ({
    venueId: v.venue.id,
    templateVersionId: v.ver.id,
    status: "on_sale" as const,
  });
  await db.insert(events).values([
    {
      ...base(rosetta),
      slug: "jazz",
      name: "Jazz Night",
      category: "music",
      isTrending: true,
      startsAt: future(48),
    },
    {
      ...base(arena),
      slug: "derby",
      name: "City Derby",
      category: "sports",
      startsAt: future(24),
    },
    {
      ...base(arena),
      slug: "pct",
      name: "100% Fun_Show",
      category: "shows",
      startsAt: future(72),
    },
    {
      ...base(arena),
      slug: "plain",
      name: "100X FunXShow",
      category: "shows",
      startsAt: future(72),
    },
    {
      ...base(rosetta),
      slug: "draft",
      name: "Jazz Draft",
      category: "music",
      startsAt: future(48),
      status: "draft",
    },
    {
      ...base(rosetta),
      slug: "past",
      name: "Jazz Past",
      category: "music",
      startsAt: future(-48),
    },
  ]);
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  await seedEvents();
});
afterAll(async () => {
  await ctx.client.close();
});

const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug).toSorted();

describe("runSearchEvents", () => {
  it("matches venue name case-insensitively (AC9: rosetta)", async () => {
    const rows = await runSearchEvents(ctx.db, { q: "rosetta" });
    expect(slugs(rows)).toEqual(["jazz"]);
  });

  it("matches event name and city", async () => {
    expect(slugs(await runSearchEvents(ctx.db, { q: "DERBY" }))).toEqual([
      "derby",
    ]);
    expect(slugs(await runSearchEvents(ctx.db, { q: "saigon" }))).toEqual([
      "derby",
      "pct",
      "plain",
    ]);
  });

  it("lists every on-sale upcoming event for an empty or blank query", async () => {
    const all = ["derby", "jazz", "pct", "plain"];
    expect(slugs(await runSearchEvents(ctx.db, {}))).toEqual(all);
    expect(slugs(await runSearchEvents(ctx.db, { q: "   " }))).toEqual(all);
  });

  it("excludes drafts and past events", async () => {
    const rows = await runSearchEvents(ctx.db, { q: "jazz" });
    expect(slugs(rows)).toEqual(["jazz"]);
  });

  it("treats LIKE metacharacters literally", async () => {
    expect(slugs(await runSearchEvents(ctx.db, { q: "100%" }))).toEqual([
      "pct",
    ]);
    expect(slugs(await runSearchEvents(ctx.db, { q: "fun_show" }))).toEqual([
      "pct",
    ]);
    expect(await runSearchEvents(ctx.db, { q: "%" })).toHaveLength(1);
  });

  it("applies category and date filters and orders by start", async () => {
    expect(
      slugs(await runSearchEvents(ctx.db, { category: "sports" })),
    ).toEqual(["derby"]);
    const ranged = await runSearchEvents(ctx.db, {
      from: future(30).toISOString(),
      to: future(60).toISOString(),
    });
    expect(slugs(ranged)).toEqual(["jazz"]);
    const ordered = await runSearchEvents(ctx.db, {});
    expect(ordered[0].slug).toBe("derby");
  });
});

describe("cached query wrappers", () => {
  it("getTrendingEvents returns only trending on-sale upcoming events", async () => {
    const rows = await getTrendingEvents();
    expect(slugs(rows)).toEqual(["jazz"]);
    expect(rows[0]).toMatchObject({
      venueName: "Rosetta Hall",
      city: "Hanoi",
      startsAt: expect.any(String),
    });
  });

  it("getCities returns distinct cities with upcoming on-sale events", async () => {
    expect(await getCities()).toEqual(["Hanoi", "Saigon"]);
  });

  it("getEventsByCity filters by city and optional date range", async () => {
    expect(slugs(await getEventsByCity("Hanoi"))).toEqual(["jazz"]);
    expect(await getEventsByCity("Nowhere")).toEqual([]);
    const ranged = await getEventsByCity(
      "Saigon",
      future(20).toISOString(),
      future(30).toISOString(),
    );
    expect(slugs(ranged)).toEqual(["derby"]);
  });

  it("searchEvents delegates to the uncached search", async () => {
    expect(slugs(await searchEvents({ q: "rosetta" }))).toEqual(["jazz"]);
  });
});

describe("escapeLike", () => {
  it("escapes backslash, percent and underscore", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
