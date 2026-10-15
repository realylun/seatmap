import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fpsSamples } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { seedEvent } from "../inventory/fixtures";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("@/db/client", () => ({ getDb: () => holder.db }));

const { fpsSummaryByEvent, listFpsSummary } = await import("./fps");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});

let seq = 0;
const row = (
  eventId: string,
  deviceClass: "mobile" | "desktop",
  avgFps: number,
  p95FrameMs: number,
) => ({
  sessionId: `sess_query_${(seq++).toString().padStart(6, "0")}`,
  eventId,
  avgFps,
  p50FrameMs: 16,
  p95FrameMs,
  longFrames: 0,
  frames: 100,
  interactionMs: 1600,
  deviceClass,
  dpr: 2,
  viewportW: 1000,
  viewportH: 800,
  userAgent: "UA",
});

describe("fpsSummaryByEvent", () => {
  it("aggregates sessions per event and device class within the window", async () => {
    const { event } = await seedEvent(ctx.db, 1);
    await ctx.db
      .insert(fpsSamples)
      .values([
        row(event.id, "desktop", 60, 16),
        row(event.id, "desktop", 40, 30),
        row(event.id, "desktop", 20, 80),
        row(event.id, "desktop", 50, 20),
        row(event.id, "mobile", 25, 60),
      ]);
    // Phiên cũ hơn 7 ngày không được tính
    await ctx.db.insert(fpsSamples).values({
      ...row(event.id, "mobile", 5, 500),
      createdAt: sql`now() - interval '8 days'`,
    });

    const rows = await fpsSummaryByEvent(ctx.db, { sinceDays: 7 });
    const mine = rows.filter((r) => r.eventId === event.id);
    expect(mine).toEqual([
      {
        eventId: event.id,
        eventName: event.name,
        deviceClass: "desktop",
        sessions: 4,
        medianFps: 45, // percentile_cont(0.5) của 20,40,50,60
        p95FrameMs: expect.closeTo(72.5, 5), // 16,20,30,80 → 30 + 0.85*(80-30)
        slowPct: 25,
      },
      {
        eventId: event.id,
        eventName: event.name,
        deviceClass: "mobile",
        sessions: 1,
        medianFps: 25,
        p95FrameMs: 60,
        slowPct: 100,
      },
    ]);
  });

  it("returns nothing when there are no samples in the window", async () => {
    const rows = await fpsSummaryByEvent(ctx.db, { sinceDays: 0 });
    expect(rows).toEqual([]);
  });

  it("listFpsSummary reads the app database with the default 7-day window", async () => {
    const rows = await listFpsSummary();
    expect(rows).toEqual(await fpsSummaryByEvent(ctx.db, { sinceDays: 7 }));
    expect(rows.length).toBeGreaterThan(0);
  });
});
