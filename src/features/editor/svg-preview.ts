// SVG đã import → ảnh nền PNG (lưu như ảnh nền thường). MapLibre image source decode qua
// ImageBitmap, mà createImageBitmap không nhận SVG ở mọi trình duyệt → raster hoá qua <img> + canvas.
// SVG trong <img> không chạy script / không tải tài nguyên ngoài → an toàn với file người dùng.
import type { Extent } from "@/domain/venue/types";

const MAX_SIDE = 4096;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener(
      "error",
      () => reject(new Error("Trình duyệt không vẽ được SVG này")),
      { once: true },
    );
    img.src = url;
  });
}

// Ép kích thước gốc = canvas và kéo giãn đúng viewBox → ảnh khớp toạ độ section, kể cả khi
// file thiếu width/height (Firefox không vẽ được) hoặc width/height lệch tỉ lệ viewBox.
function sizedSvg(text: string, width: number, height: number): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("preserveAspectRatio", "none");
  return new XMLSerializer().serializeToString(doc);
}

/** PNG cùng tỉ lệ extent (cạnh dài MAX_SIDE) */
export async function rasterizeSvg(
  text: string,
  extent: Extent,
): Promise<Blob> {
  const ratio = extent.w / extent.h;
  const [width, height] =
    ratio >= 1
      ? [MAX_SIDE, Math.round(MAX_SIDE / ratio)]
      : [Math.round(MAX_SIDE * ratio), MAX_SIDE];
  const svgUrl = URL.createObjectURL(
    new Blob([sizedSvg(text, width, height)], { type: "image/svg+xml" }),
  );
  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không tạo được canvas");
    ctx.drawImage(img, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("Không xuất được ảnh PNG");
    return png;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
