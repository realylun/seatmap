import { LONG_FRAME_MS } from "./fps-stats";

/**
 * Cận trên mỗi bucket histogram (ms); bucket cuối là "> 250ms". Đặt ngay TRÊN các mốc vsync
 * (120Hz ≈ 8.33, 60Hz ≈ 16.67, 30Hz ≈ 33.3) để frame đúng nhịp có jitter không bị đẩy sang bucket sau.
 */
export const BUCKET_EDGES_MS: readonly number[] = [
  9, 17.5, 34, 50, 67, 100, 250,
];

/**
 * Tóm tắt cả phiên bằng histogram cố định → bộ nhớ O(1) dù người dùng xem map hàng giờ.
 * Chỉ tính frame trong lúc map đang di chuyển (cờ interactive), vì MapLibre chỉ render khi có thay đổi.
 */
export type SessionState = {
  readonly counts: readonly number[];
  readonly frames: number;
  readonly totalMs: number;
  readonly longFrames: number;
  readonly maxMs: number;
};

export type SessionSummary = {
  readonly avgFps: number;
  readonly p50FrameMs: number;
  readonly p95FrameMs: number;
  readonly longFrames: number;
  readonly frames: number;
  readonly interactionMs: number;
};

export const EMPTY_SESSION: SessionState = {
  counts: Array.from({ length: BUCKET_EDGES_MS.length + 1 }, () => 0),
  frames: 0,
  totalMs: 0,
  longFrames: 0,
  maxMs: 0,
};

function bucketOf(dt: number): number {
  const i = BUCKET_EDGES_MS.findIndex((edge) => dt <= edge);
  return i === -1 ? BUCKET_EDGES_MS.length : i;
}

export function recordFrames(
  prev: SessionState,
  buf: Float32Array,
  flags: Uint8Array,
  len: number,
): SessionState {
  const counts = [...prev.counts];
  let { frames, totalMs, longFrames, maxMs } = prev;
  for (let i = 0; i < len; i++) {
    if (flags[i] !== 1) continue;
    const dt = buf[i];
    counts[bucketOf(dt)] += 1;
    frames += 1;
    totalMs += dt;
    if (dt > LONG_FRAME_MS) longFrames += 1;
    if (dt > maxMs) maxMs = dt;
  }
  return { counts, frames, totalMs, longFrames, maxMs };
}

/** Percentile xấp xỉ = cận trên bucket chứa rank (không vượt quá frame dài nhất đã thấy) */
function histogramPercentile(s: SessionState, q: number): number {
  const rank = Math.max(1, Math.ceil(q * s.frames));
  let seen = 0;
  for (let i = 0; i < s.counts.length; i++) {
    seen += s.counts[i];
    if (seen >= rank) {
      const edge = BUCKET_EDGES_MS[i] ?? s.maxMs;
      return Math.min(edge, s.maxMs);
    }
  }
  return s.maxMs;
}

export function sessionSummary(s: SessionState): SessionSummary {
  if (s.frames === 0) {
    return {
      avgFps: 0,
      p50FrameMs: 0,
      p95FrameMs: 0,
      longFrames: 0,
      frames: 0,
      interactionMs: 0,
    };
  }
  return {
    avgFps: s.totalMs > 0 ? (s.frames * 1000) / s.totalMs : 0,
    p50FrameMs: histogramPercentile(s, 0.5),
    p95FrameMs: histogramPercentile(s, 0.95),
    longFrames: s.longFrames,
    frames: s.frames,
    interactionMs: s.totalMs,
  };
}
