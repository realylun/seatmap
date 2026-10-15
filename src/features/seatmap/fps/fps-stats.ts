/** Ngưỡng màu overlay: ≥ GOOD_FPS xanh, ≥ OK_FPS vàng, còn lại đỏ */
export const GOOD_FPS = 50;
export const OK_FPS = 30;
/** Frame dài hơn mức này (ms) tính là giật */
export const LONG_FRAME_MS = 50;
/** Cửa sổ trượt cho FPS tức thời trên overlay */
export const WINDOW_SPAN_MS = 1000;

export type FpsLevel = "good" | "ok" | "poor";

export type FrameStats = {
  readonly fps: number;
  readonly p50: number;
  readonly p95: number;
  readonly longFrames: number;
};

const ZERO_STATS: FrameStats = { fps: 0, p50: 0, p95: 0, longFrames: 0 };

/** Nearest-rank percentile trên mảng đã sắp xếp tăng dần */
function percentile(sorted: readonly number[], q: number): number {
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1];
}

export function computeFrameStats(frameTimes: readonly number[]): FrameStats {
  if (frameTimes.length === 0) return ZERO_STATS;
  const total = frameTimes.reduce((sum, dt) => sum + dt, 0);
  const sorted = frameTimes.toSorted((a, b) => a - b);
  return {
    fps: total > 0 ? (frameTimes.length * 1000) / total : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    longFrames: frameTimes.filter((dt) => dt > LONG_FRAME_MS).length,
  };
}

export function fpsLevel(fps: number): FpsLevel {
  if (fps >= GOOD_FPS) return "good";
  if (fps >= OK_FPS) return "ok";
  return "poor";
}

/** Chữ trên overlay: "60 fps · 16.7 ms" (ms = p95 frame time trong cửa sổ 1s) */
export function formatStats(s: { fps: number; p95: number }): string {
  return `${Math.round(s.fps)} fps · ${s.p95.toFixed(1)} ms`;
}

/** Nối frame mới rồi bỏ frame cũ nhất cho tới khi tổng thời gian ≤ span (luôn giữ frame mới nhất) */
export function appendToWindow(
  window: readonly number[],
  frameTimes: readonly number[],
  spanMs: number = WINDOW_SPAN_MS,
): number[] {
  const combined = [...window, ...frameTimes];
  let total = combined.reduce((sum, dt) => sum + dt, 0);
  let start = 0;
  while (total > spanMs && combined.length - start > 1) {
    total -= combined[start];
    start += 1;
  }
  return combined.slice(start);
}
