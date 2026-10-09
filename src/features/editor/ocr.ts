// OCR tên section bằng tesseract.js — import động, chỉ tải thư viện (~vài MB) khi người dùng bật OCR.
import type { DetectedShape } from "@/domain/venue/detect";

const CROP_MAX_W = 160;
const CROP_MAX_H = 56;
const UPSCALE = 3; // chữ nhỏ → phóng to giúp tesseract đọc chính xác hơn
const INK_LUMINANCE = 130; // chữ tối hơn ngưỡng này; nền tô màu và vạch mờ sáng hơn
const NAME_PATTERN = /^[A-Z]{0,3}\d{1,4}[A-Z]?$/;

/** Kết quả OCR → tên section hợp lệ ("101", "C12", "FL2A") hoặc null */
export function cleanName(text: string): string | null {
  const candidate = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return NAME_PATTERN.test(candidate) ? candidate : null;
}

function binarize(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const isInk =
      0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < INK_LUMINANCE;
    const v = isInk ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

// Tên thường nằm giữa section → cắt khung quanh tâm, chỉ lấy phần bên trong polygon
// (bỏ viền section và chữ của section bên cạnh), rồi nhị phân hoá để bỏ các vạch mờ
function cropAround(
  source: HTMLCanvasElement,
  region: DetectedShape,
): HTMLCanvasElement {
  const { center, bbox, ring } = region;
  const cw = Math.min(bbox.w * 0.9, CROP_MAX_W);
  const ch = Math.min(bbox.h * 0.9, CROP_MAX_H);
  const [ox, oy] = [center[0] - cw / 2, center[1] - ch / 2];
  const canvas = Object.assign(document.createElement("canvas"), {
    width: Math.round(cw * UPSCALE),
    height: Math.round(ch * UPSCALE),
  });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas 2D");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ring.forEach(([x, y], i) => {
    const [px, py] = [(x - ox) * UPSCALE, (y - oy) * UPSCALE];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.clip();
  ctx.drawImage(source, ox, oy, cw, ch, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  binarize(ctx, canvas.width, canvas.height);
  return canvas;
}

/** Mảng tên (null nếu đọc không ra) theo thứ tự regions */
export async function readSectionNames(
  source: HTMLCanvasElement,
  regions: readonly DetectedShape[],
  onProgress?: (done: number, total: number) => void,
): Promise<(string | null)[]> {
  const { default: Tesseract } = await import("tesseract.js"); // gói CJS (export =)
  const worker = await Tesseract.createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      // Ô cắt trống (section không có chữ) làm tesseract in thống kê debug ra console.error
      debug_file: "/dev/null",
    });
    const names: (string | null)[] = [];
    for (const [i, region] of regions.entries()) {
      const { data } = await worker.recognize(cropAround(source, region));
      names.push(cleanName(data.text));
      onProgress?.(i + 1, regions.length);
    }
    return names;
  } finally {
    await worker.terminate();
  }
}
