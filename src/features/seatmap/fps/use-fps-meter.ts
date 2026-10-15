import type { Map as MapLibreMap } from "maplibre-gl";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { BATCH_CAPACITY, createFrameBatcher } from "./frame-batcher";
import { type MoveEmitter, startFrameLoop } from "./frame-loop";
import { type WorkerLike, createFpsSink } from "./fps-sink";
import type { FpsStats, WorkerToMain } from "./messages";
import {
  type CanvasLike,
  TELEMETRY_ENDPOINT,
  collectDeviceInfo,
} from "./telemetry";

/** Main thread chuyển batch frame sang worker với nhịp này (ms) → overlay cập nhật 2 lần/giây */
const FLUSH_INTERVAL_MS = 500;

const createWorker =
  typeof Worker === "undefined"
    ? null
    : (): WorkerLike =>
        new Worker(new URL("./fps.worker.ts", import.meta.url), {
          type: "module",
        });

/** Lưới an toàn khi rời trang: worker có thể bị huỷ trước khi gửi xong, beacon thì không */
function sendBeacon(json: string) {
  try {
    navigator.sendBeacon(
      TELEMETRY_ENDPOINT,
      new Blob([json], { type: "application/json" }),
    );
  } catch {
    // Trang đang đóng: không có chỗ nào để báo lỗi, và không được làm hỏng việc rời trang
  }
}

/** Phần của MapLibre map mà bộ đo cần */
export type MeterMap = MoveEmitter & {
  getCanvas(): CanvasLike | null;
};

/** Bật đo FPS cho một map; trả về hàm dọn dẹp */
export function startMeter(
  map: MeterMap,
  eventId: string,
  onStats: (stats: FpsStats) => void,
  workerFactory: (() => WorkerLike) | null = createWorker,
): () => void {
  let payloadJson: string | null = null;
  let beaconed: string | null = null;

  const onMessage = (msg: WorkerToMain) => {
    if (msg.type === "stats") {
      onStats({ fps: msg.fps, p95: msg.p95, level: msg.level });
    } else {
      payloadJson = msg.json;
    }
  };
  const sink = createFpsSink(onMessage, workerFactory);
  sink.post({
    type: "init",
    eventId,
    sessionId: nanoid(),
    device: collectDeviceInfo(map.getCanvas()),
  });

  const batcher = createFrameBatcher(BATCH_CAPACITY, (msg, transfer) =>
    sink.post(msg, transfer),
  );
  const stopLoop = startFrameLoop(map, batcher);
  const interval = setInterval(() => batcher.flush(), FLUSH_INTERVAL_MS);

  const beacon = () => {
    if (!payloadJson || payloadJson === beaconed) return;
    beaconed = payloadJson;
    sendBeacon(payloadJson);
  };
  const onVisibility = () => {
    if (document.visibilityState !== "hidden") return;
    batcher.flush();
    sink.post({ type: "flush" });
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", beacon);

  return () => {
    stopLoop();
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", beacon);
    // Rời seatmap bằng điều hướng client-side không có pagehide → gửi bản cuối ở đây.
    // Beacon mang payload đã cache (chậm tối đa 1 batch 500ms). flush() chỉ giúp fallback ở main
    // thread: worker bị terminate ngay sau đó nên thường không kịp xử lý batch cuối — chấp nhận được
    // với telemetry best-effort, và upsert chỉ nhận bản nhiều frame hơn nên không bị lùi dữ liệu.
    batcher.flush();
    beacon();
    sink.terminate();
  };
}

/**
 * Đo FPS seatmap. Main thread chỉ chạy vòng rAF ghi frame time; worker tính số liệu cho overlay
 * và gửi telemetry. State chỉ nằm trong component gọi hook này (FpsOverlay) để SeatMap không re-render.
 */
export function useFpsMeter(
  map: MapLibreMap | null,
  eventId: string,
): FpsStats | null {
  const [stats, setStats] = useState<FpsStats | null>(null);
  useEffect(
    () => (map ? startMeter(map, eventId, setStats) : undefined),
    [map, eventId],
  );
  return stats;
}
