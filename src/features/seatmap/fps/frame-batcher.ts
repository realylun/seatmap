import type { MainToWorker } from "./messages";

export const BATCH_CAPACITY = 64;

export type PostFrames = (msg: MainToWorker, transfer: Transferable[]) => void;

export type FrameBatcher = {
  push(dt: number, interactive: boolean): void;
  flush(): void;
};

/**
 * Gom frame time ở main thread rồi chuyển sang worker bằng transferable (không copy).
 * Cố ý dùng typed array tái cấp phát thay vì mảng bất biến: chạy mỗi frame trong rAF nên
 * không được tạo rác — sau khi transfer, buffer cũ bị detach nên luôn cấp buffer mới.
 */
export function createFrameBatcher(
  capacity: number,
  post: PostFrames,
): FrameBatcher {
  let buf = new Float32Array(capacity);
  let flags = new Uint8Array(capacity);
  let len = 0;

  const flush = () => {
    if (len === 0) return;
    post({ type: "frames", buf, flags, len }, [buf.buffer, flags.buffer]);
    buf = new Float32Array(capacity);
    flags = new Uint8Array(capacity);
    len = 0;
  };

  return {
    push(dt, interactive) {
      buf[len] = dt;
      flags[len] = interactive ? 1 : 0;
      len += 1;
      if (len === capacity) flush();
    },
    flush,
  };
}
