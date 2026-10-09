// Web Worker: chạy flood fill / dò viền ngoài main thread (ảnh 2000×1500 = 3 triệu pixel).
import {
  detectDarkObjects,
  detectSections,
  type DetectedShape,
  type ImageLike,
} from "@/domain/venue/detect";

export type DetectRequest = ImageLike;
export type DetectResponse =
  | { ok: true; regions: DetectedShape[]; objects: DetectedShape[] }
  | { ok: false; error: string };

// Trong worker, postMessage thuộc DedicatedWorkerGlobalScope — không có targetOrigin
/* oxlint-disable unicorn/require-post-message-target-origin */
self.addEventListener("message", (event: MessageEvent<DetectRequest>) => {
  try {
    const regions = detectSections(event.data);
    const objects = detectDarkObjects(event.data);
    self.postMessage({ ok: true, regions, objects } satisfies DetectResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ ok: false, error: message } satisfies DetectResponse);
  }
});
