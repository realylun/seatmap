import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fpsSamples } from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { seedEvent } from "../inventory/fixtures";
import type { FpsSampleInput } from "./fps-schema";
import { recordFpsSample } from "./record-fps";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

const sample = (eventId: string, over: Partial<FpsSampleInput> = {}) => ({
  sessionId: "sess_upsert_0001",
  eventId,
  avgFps: 58.5,
  p50FrameMs: 16,
  p95FrameMs: 33,
  longFrames: 2,
  frames: 120,
  interactionMs: 2050,
  deviceClass: "desktop" as const,
  dpr: 2,
  viewportW: 1440,
  viewportH: 900,
  cores: 8,
  memoryGb: null,
  gpu: "Apple M2",
  userAgent: "Mozilla/5.0 test",
  ...over,
});

describe("recordFpsSample", () => {
  it("rejects an unknown event", async () => {
    const result = await recordFpsSample(
      ctx.db,
      sample("8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f"),
    );
    expect(result).toEqual({ ok: false, reason: "event_not_found" });
  });

  it("upserts one row per session, keeping the latest values", async () => {
    const { event } = await seedEvent(ctx.db, 1);
    expect(await recordFpsSample(ctx.db, sample(event.id))).toEqual({
      ok: true,
    });
    await recordFpsSample(
      ctx.db,
      sample(event.id, { frames: 300, avgFps: 41.25 }),
    );
    const rows = await ctx.db
      .select()
      .from(fpsSamples)
      .where(eq(fpsSamples.sessionId, "sess_upsert_0001"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventId: event.id,
      frames: 300,
      avgFps: 41.25,
      deviceClass: "desktop",
      userAgent: "Mozilla/5.0 test",
    });
  });

  it("does not let a session id be moved to another event", async () => {
    const { event: a } = await seedEvent(ctx.db, 1);
    const { event: b } = await seedEvent(ctx.db, 1);
    const s = { sessionId: "sess_hijack_0001" };
    await recordFpsSample(ctx.db, sample(a.id, { ...s, frames: 50 }));
    await recordFpsSample(ctx.db, sample(b.id, { ...s, frames: 999 }));
    const rows = await ctx.db
      .select()
      .from(fpsSamples)
      .where(eq(fpsSamples.sessionId, "sess_hijack_0001"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventId: a.id, frames: 50 });
  });

  it("never replaces a row with an older, smaller snapshot", async () => {
    // beacon (payload cũ) và fetch của worker (payload mới) có thể tới server sai thứ tự
    const { event } = await seedEvent(ctx.db, 1);
    const s = { sessionId: "sess_ordering_001" };
    await recordFpsSample(ctx.db, sample(event.id, { ...s, frames: 100 }));
    await recordFpsSample(ctx.db, sample(event.id, { ...s, frames: 50 }));
    const rows = await ctx.db
      .select()
      .from(fpsSamples)
      .where(eq(fpsSamples.sessionId, "sess_ordering_001"));
    expect(rows[0].frames).toBe(100);
  });
});
