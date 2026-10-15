// Dedicated Worker: nhận frame time từ main thread, tính thống kê và gửi telemetry
// để không tốn main thread (nơi MapLibre/React đang chạy). Logic nằm trong fps-engine.
import { createFpsEngine } from "./fps-engine";
import type { MainToWorker, WorkerToMain } from "./messages";
import { TELEMETRY_ENDPOINT } from "./telemetry";

function send(json: string) {
  fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    body: json,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch((error: unknown) => {
    // Telemetry là best-effort: lỗi mạng không retry, lần gửi sau sẽ mang số liệu cộng dồn
    console.warn("fps telemetry send failed", error);
  });
}

const engine = createFpsEngine({
  // Đây là DedicatedWorkerGlobalScope (không có targetOrigin) nhưng tsconfig chỉ nạp lib "dom"
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  emit: (msg: WorkerToMain) => self.postMessage(msg),
  send,
  now: () => performance.now(),
});

self.addEventListener("message", (e: MessageEvent<MainToWorker>) =>
  engine.handle(e.data),
);
