import { createFpsEngine } from "./fps-engine";
import type { MainToWorker, WorkerToMain } from "./messages";

/** Phần của Worker mà sink dùng (Worker thật thoả kiểu này; test dùng bản giả) */
export type WorkerLike = {
  postMessage(msg: MainToWorker, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (e: MessageEvent<WorkerToMain>) => void,
  ): void;
  addEventListener(type: "error", listener: (e: Event) => void): void;
};

export type FpsSink = {
  post(msg: MainToWorker, transfer?: Transferable[]): void;
  terminate(): void;
};

type Engine = ReturnType<typeof createFpsEngine>;

function localEngine(onMessage: (msg: WorkerToMain) => void): Engine {
  return createFpsEngine({
    emit: onMessage,
    send: null,
    now: () => performance.now(),
  });
}

function warnFallback(reason: unknown) {
  console.warn("FPS worker unavailable; overlay only, telemetry off", reason);
}

function tryCreate(createWorker: (() => WorkerLike) | null): WorkerLike | null {
  try {
    return createWorker?.() ?? null;
  } catch (error) {
    warnFallback(error);
    return null;
  }
}

/**
 * Nơi main thread gửi frame tới: Web Worker nếu tạo được, ngược lại engine chạy tại chỗ
 * (overlay vẫn hiện, telemetry tắt để không tốn main thread cho việc gửi mạng).
 */
export function createFpsSink(
  onMessage: (msg: WorkerToMain) => void,
  createWorker: (() => WorkerLike) | null,
): FpsSink {
  let worker = tryCreate(createWorker);
  let fallback: Engine | null = worker ? null : localEngine(onMessage);

  if (worker) {
    const w = worker;
    w.addEventListener("message", (e) => onMessage(e.data));
    // Script worker không tải được (404, CSP...) → chuyển sang fallback, không báo lỗi lên trang
    w.addEventListener("error", (e) => {
      e.preventDefault();
      warnFallback(e);
      w.terminate();
      worker = null;
      fallback = localEngine(onMessage);
    });
  }

  return {
    post(msg, transfer) {
      if (worker) worker.postMessage(msg, transfer ?? []);
      else fallback?.handle(msg);
    },
    terminate() {
      worker?.terminate();
    },
  };
}
