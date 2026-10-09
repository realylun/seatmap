// Auto-detect trên trình duyệt: ảnh nền → canvas → Web Worker (detect) → OCR (tuỳ chọn) → section nháp.
import type { DetectedShape } from "@/domain/venue/detect";
import type { Extent, VenueObject } from "@/domain/venue/types";
import type { SectionDraft } from "@/domain/venue/venue-file";
import { regionsToDrafts, shapesToObjects } from "./autodetect-drafts";
import type { DetectRequest, DetectResponse } from "./detect.worker";
import { readSectionNames } from "./ocr";

export type AutoDetectResult = {
  readonly drafts: SectionDraft[];
  /** Sân khấu (vùng tối) — thay toàn bộ mỗi lần chạy lại */
  readonly objects: VenueObject[];
};

type WorkerShapes = { regions: DetectedShape[]; objects: DetectedShape[] };

export type AutoDetectOptions = {
  readonly useOcr: boolean;
  readonly onStatus: (text: string) => void;
};

function loadCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // ảnh trên Blob khác origin → cần CORS để đọc pixel
    img.addEventListener("load", () => {
      const canvas = Object.assign(document.createElement("canvas"), {
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("Trình duyệt không hỗ trợ canvas 2D"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    });
    img.addEventListener("error", () =>
      reject(new Error("Không đọc được ảnh nền")),
    );
    img.src = url;
  });
}

function detectInWorker(image: ImageData): Promise<WorkerShapes> {
  const worker = new Worker(new URL("./detect.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise<WorkerShapes>((resolve, reject) => {
    worker.addEventListener(
      "message",
      (event: MessageEvent<DetectResponse>) => {
        if (event.data.ok) resolve(event.data);
        else reject(new Error(event.data.error));
      },
    );
    worker.addEventListener("error", (event) =>
      reject(new Error(event.message || "Worker nhận diện bị lỗi")),
    );
    const request: DetectRequest = {
      width: image.width,
      height: image.height,
      data: image.data,
    };
    worker.postMessage(request, [image.data.buffer]);
  }).finally(() => worker.terminate());
}

export async function autoDetect(
  imageUrl: string,
  extent: Extent,
  options: AutoDetectOptions,
): Promise<AutoDetectResult> {
  const { useOcr, onStatus } = options;
  onStatus("Đang phân tích pixel…");
  const canvas = await loadCanvas(imageUrl);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas 2D");
  const { regions, objects } = await detectInWorker(
    ctx.getImageData(0, 0, canvas.width, canvas.height),
  );
  if (regions.length === 0) {
    throw new Error(
      "Không tìm thấy vùng nào — ảnh cần các section tô màu nhạt, viền đậm.",
    );
  }
  onStatus(
    `Tìm thấy ${regions.length} vùng${useOcr ? ", đang đọc tên (OCR)…" : ""}`,
  );
  const names = useOcr
    ? await readSectionNames(canvas, regions, (done, total) =>
        onStatus(`OCR ${done}/${total}`),
      )
    : regions.map(() => null);
  return {
    drafts: regionsToDrafts(regions, names, extent, canvas),
    objects: shapesToObjects(objects, extent, canvas),
  };
}
