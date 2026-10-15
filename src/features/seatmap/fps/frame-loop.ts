import type { FrameBatcher } from "./frame-batcher";

/** Khoảng cách frame lớn hơn mức này = tab vừa quay lại từ background → bỏ qua */
export const MAX_FRAME_GAP_MS = 1000;

/** Phần của MapLibre map mà vòng đo cần (để test không phải dựng map thật) */
export type MoveEmitter = {
  on(type: "movestart" | "moveend", fn: () => void): unknown;
  off(type: "movestart" | "moveend", fn: () => void): unknown;
};

/**
 * Vòng rAF đo frame time ở main thread. Callback cố ý chỉ trừ timestamp và ghi vào batcher
 * (typed array) — mọi tính toán nằm trong worker để không làm chậm chính thứ đang đo.
 * Cờ "interactive" bật trong khoảng movestart…moveend (pan/zoom/rotate/pitch/flyTo).
 */
export function startFrameLoop(
  map: MoveEmitter,
  batcher: Pick<FrameBatcher, "push">,
): () => void {
  let interacting = false;
  let last: number | null = null;
  let raf = 0;
  const onStart = () => {
    interacting = true;
  };
  const onEnd = () => {
    interacting = false;
  };

  const tick = (t: number) => {
    if (last !== null && t - last <= MAX_FRAME_GAP_MS) {
      batcher.push(t - last, interacting);
    }
    last = t;
    raf = requestAnimationFrame(tick);
  };

  map.on("movestart", onStart);
  map.on("moveend", onEnd);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    map.off("movestart", onStart);
    map.off("moveend", onEnd);
  };
}
