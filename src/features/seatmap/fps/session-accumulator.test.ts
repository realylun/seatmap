import { describe, expect, it } from "vitest";
import {
  BUCKET_EDGES_MS,
  EMPTY_SESSION,
  recordFrames,
  sessionSummary,
} from "./session-accumulator";

const flags = (...xs: number[]) => Uint8Array.from(xs);

describe("recordFrames", () => {
  it("only counts frames flagged as interactive", () => {
    const s = recordFrames(
      EMPTY_SESSION,
      Float32Array.from([16, 100, 20, 16]),
      flags(1, 0, 1, 0),
      4,
    );
    expect(s.frames).toBe(2);
    expect(s.totalMs).toBe(36);
    expect(s.longFrames).toBe(0);
  });

  it("respects len and ignores trailing buffer slots", () => {
    const s = recordFrames(
      EMPTY_SESSION,
      Float32Array.from([16, 16, 999]),
      flags(1, 1, 1),
      2,
    );
    expect(s.frames).toBe(2);
    expect(s.maxMs).toBe(16);
  });

  it("does not mutate the previous session", () => {
    const next = recordFrames(
      EMPTY_SESSION,
      Float32Array.from([16]),
      flags(1),
      1,
    );
    expect(EMPTY_SESSION.frames).toBe(0);
    expect(EMPTY_SESSION.counts.every((c) => c === 0)).toBe(true);
    expect(next.frames).toBe(1);
  });

  it("buckets frames with a fixed-size histogram", () => {
    const s = recordFrames(
      EMPTY_SESSION,
      Float32Array.from([5, 16, 17, 60, 300]),
      flags(1, 1, 1, 1, 1),
      5,
    );
    expect(s.counts).toHaveLength(BUCKET_EDGES_MS.length + 1);
    // edges 9,17.5,34,50,67,100,250 → [≤9,≤17.5,≤34,≤50,≤67,≤100,≤250,>250]
    expect(s.counts).toEqual([1, 2, 0, 0, 1, 0, 0, 1]);
    expect(s.longFrames).toBe(2);
  });
});

describe("sessionSummary", () => {
  it("returns zeros for an empty session", () => {
    expect(sessionSummary(EMPTY_SESSION)).toEqual({
      avgFps: 0,
      p50FrameMs: 0,
      p95FrameMs: 0,
      longFrames: 0,
      frames: 0,
      interactionMs: 0,
    });
  });

  it("derives avg fps and bucket-upper-bound percentiles", () => {
    // 19 frame 16ms + 1 frame 60ms → tổng 364ms, 20 frame
    const dts = [...Array.from({ length: 19 }, () => 16), 60];
    const s = recordFrames(
      EMPTY_SESSION,
      Float32Array.from(dts),
      Uint8Array.from(dts.map(() => 1)),
      dts.length,
    );
    const sum = sessionSummary(s);
    expect(sum.frames).toBe(20);
    expect(sum.interactionMs).toBe(364);
    expect(sum.avgFps).toBeCloseTo(20_000 / 364, 5);
    expect(sum.p50FrameMs).toBe(17.5); // rank 10 rơi vào bucket ≤17.5
    expect(sum.p95FrameMs).toBe(17.5); // rank 19 vẫn ≤17.5
    expect(sum.longFrames).toBe(1);
  });

  it("keeps real 60Hz and 120Hz frames in the vsync bucket", () => {
    // rAF ở 60Hz cho ~16.67ms (có jitter), 120Hz ~8.33ms: không được rơi sang bucket kế tiếp
    const at60 = [...Array.from({ length: 99 }, () => 16.67), 60];
    const s60 = recordFrames(
      EMPTY_SESSION,
      Float32Array.from(at60),
      Uint8Array.from(at60.map(() => 1)),
      at60.length,
    );
    expect(sessionSummary(s60).p50FrameMs).toBeLessThanOrEqual(17.5);
    expect(sessionSummary(s60).p95FrameMs).toBeLessThanOrEqual(17.5);
    const at120 = Array.from({ length: 50 }, () => 8.4);
    const s120 = recordFrames(
      EMPTY_SESSION,
      Float32Array.from(at120),
      Uint8Array.from(at120.map(() => 1)),
      at120.length,
    );
    expect(sessionSummary(s120).p95FrameMs).toBeLessThanOrEqual(9);
  });

  it("uses the observed max for the overflow bucket", () => {
    const s = recordFrames(
      EMPTY_SESSION,
      Float32Array.from([400]),
      flags(1),
      1,
    );
    expect(sessionSummary(s).p95FrameMs).toBe(400);
  });
});
