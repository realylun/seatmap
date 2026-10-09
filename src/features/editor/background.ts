// Ảnh nền template: đọc kích thước (→ extent) và upload thẳng lên Vercel Blob qua /api/blob/upload.
import { uploadImage } from "@/lib/upload-image";

export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
export const BACKGROUND_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const MAX_NAME_LENGTH = 100;

/** Tên blob khớp quy tắc của /api/blob/upload: backgrounds/<[\w.-]{1,100}>; server thêm hậu tố ngẫu nhiên */
export function backgroundPathname(
  templateId: string,
  fileName: string,
): string {
  const safe = `${templateId}-${fileName}`.replace(/[^\w.-]+/g, "-");
  return `backgrounds/${safe.slice(-MAX_NAME_LENGTH)}`;
}

export async function readImageSize(
  file: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch((cause: unknown) => {
    throw new Error("File không phải ảnh hợp lệ", { cause });
  });
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export async function uploadBackground(
  templateId: string,
  file: File,
): Promise<string> {
  const isAllowedType = (BACKGROUND_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!isAllowedType) throw new Error("Chỉ nhận ảnh JPEG, PNG hoặc WebP");
  if (file.size > MAX_BACKGROUND_BYTES) throw new Error("Ảnh lớn hơn 10 MB");
  // URL có thể mang hậu tố ngẫu nhiên do server thêm → luôn dùng url trả về, không tự ghép
  return uploadImage(backgroundPathname(templateId, file.name), file);
}
