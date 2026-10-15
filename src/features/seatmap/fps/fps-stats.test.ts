import { describe, expect, it } from "vitest";
import {
  GOOD_FPS,
  LONG_FRAME_MS,
  OK_FPS,
  appendToWindow,
  computeFrameStats,
  formatStats,
  fpsLevel,
} from "./fps-stats";

describe("computeFrameStats", () => {
  it("returns zeros for no frames", () => {
    expect(computeFrameStats([])).toEqual({
      fps: 0,
      p50: 0,
      p95: 0,
      longFrames: 0,
    });
  });

  it("handles a single frame", () => {
    expect(computeFrameStats([20])).toEqual({
      fps: 50,
      p50: 20,
      p95: 20,
      longFrames: 0,
    });
  });

  it("computes fps from total time and nearest-rank percentiles", () => {
    // 10 frames, tổng 250ms → 40 fps; sắp xếp: 10×8, 40, 90
    const frames = [10, 10, 10, 90, 10, 10, 10, 10, 40, 50];
    // sorted: 10,10,10,10,10,10,10,40,50,90 ; p50 = rank 5 → 10 ; p95 = rank 10 → 90
    expect(computeFrameStats(frames)).toEqual({
      fps: 40,
      p50: 10,
      p95: 90,
      longFrames: 1, // chỉ 90 > 50 (50 không tính)
    });
  });
});

describe("fpsLevel", () => {
  it("uses the documented thresholds", () => {
    expect(GOOD_FPS).toBe(50);
    expect(OK_FPS).toBe(30);
    expect(LONG_FRAME_MS).toBe(50);
    expect(fpsLevel(60)).toBe("good");
    expect(fpsLevel(50)).toBe("good");
    expect(fpsLevel(49.9)).toBe("ok");
    expect(fpsLevel(30)).toBe("ok");
    expect(fpsLevel(29.9)).toBe("poor");
    expect(fpsLevel(0)).toBe("poor");
  });
});

describe("formatStats", () => {
  it("renders 'NN fps · NN.N ms'", () => {
    expect(formatStats({ fps: 59.6, p95: 16.66 })).toBe("60 fps · 16.7 ms");
    expect(formatStats({ fps: 0, p95: 0 })).toBe("0 fps · 0.0 ms");
  });
});

describe("appendToWindow", () => {
  it("keeps only the most recent frames within the span", () => {
    const w = appendToWindow([400, 400], [300, 200], 1000);
    // 400+300+200 = 900 ≤ 1000; thêm 400 nữa = 1300 > 1000 → bỏ frame cũ nhất
    expect(w).toEqual([400, 300, 200]);
  });

  it("does not mutate the input", () => {
    const prev = [100];
    appendToWindow(prev, [100], 1000);
    expect(prev).toEqual([100]);
  });

  it("always keeps the latest frame even if it exceeds the span", () => {
    expect(appendToWindow([16], [1500], 1000)).toEqual([1500]);
  });
});
