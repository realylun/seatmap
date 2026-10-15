import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FpsSampleInput } from "@/server/telemetry/fps-schema";

type Recorded = FpsSampleInput & { userAgent: string };
type Result = { ok: true } | { ok: false; reason: "event_not_found" };
const h = vi.hoisted(() => ({
  impl: null as null | (() => Promise<Result>),
  calls: [] as Recorded[],
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/telemetry/record-fps", () => ({
  recordFpsSample: (_db: unknown, input: Recorded) => {
    h.calls.push(input);
    if (!h.impl) throw new Error("no impl");
    return h.impl();
  },
}));

const { POST } = await import("./route");

const EVENT_ID = "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f";
const valid = {
  sessionId: "sess_route_000001",
  eventId: EVENT_ID,
  avgFps: 59.2,
  p50FrameMs: 16,
  p95FrameMs: 33,
  longFrames: 1,
  frames: 240,
  interactionMs: 4000,
  deviceClass: "mobile",
  dpr: 3,
  viewportW: 390,
  viewportH: 844,
  cores: 6,
  memoryGb: 4,
  gpu: "Apple GPU",
};

const post = (body: string, ua = "UA/1.0") =>
  POST(
    new NextRequest("http://localhost/api/telemetry/fps", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "user-agent": ua },
    }),
  );

describe("POST /api/telemetry/fps", () => {
  beforeEach(() => {
    h.impl = async () => ({ ok: true });
    h.calls = [];
  });

  it("records a valid sample with the server-side user agent", async () => {
    const res = await post(JSON.stringify(valid), "Browser/2.0");
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ ...valid, userAgent: "Browser/2.0" });
  });

  it("truncates the user agent", async () => {
    await post(JSON.stringify(valid), "x".repeat(500));
    expect(h.calls[0].userAgent).toHaveLength(300);
  });

  it("clamps out-of-range numbers", async () => {
    await post(
      JSON.stringify({ ...valid, avgFps: 9999, p95FrameMs: -5, dpr: 50 }),
    );
    expect(h.calls[0]).toMatchObject({ avgFps: 240, p95FrameMs: 0, dpr: 10 });
  });

  it.each([
    ["invalid json", "{nope"],
    ["schema mismatch", JSON.stringify({ ...valid, frames: "many" })],
    ["non-uuid event id", JSON.stringify({ ...valid, eventId: "123" })],
    ["unknown field", JSON.stringify({ ...valid, ip: "1.2.3.4" })],
    ["oversized body", JSON.stringify({ ...valid, gpu: "g".repeat(3000) })],
    ["NUL byte in gpu", JSON.stringify({ ...valid, gpu: "bad\u0000gpu" })],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("returns 404 when the event does not exist", async () => {
    h.impl = async () => ({ ok: false, reason: "event_not_found" });
    const res = await post(JSON.stringify(valid));
    expect(res.status).toBe(404);
  });

  it("returns 500 and logs context when the database fails", async () => {
    h.impl = async () => {
      throw new Error("db down");
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post(JSON.stringify(valid));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith(
      "fps telemetry failed",
      expect.objectContaining({ eventId: EVENT_ID }),
    );
  });
});
