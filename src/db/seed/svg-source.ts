// Venue nguồn SVG (quy chuẩn docs/seatmap-svg-spec.md) → venue.json tối thiểu cho createTemplate.
// Đi đúng đường của nút "Nhập SVG" trong editor; SVG có lỗi thì dừng seed thay vì seed map hỏng.
import { blockFromSvg, svgToDrafts } from "@/domain/venue/svg/svg-venue";
import type { EditorBlock } from "@/domain/venue/types";

const MAX_LISTED_ERRORS = 5;

export function venueFileFromSvg(text: string): { editor: EditorBlock } {
  const imported = svgToDrafts(text);
  const errors = imported.issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    const listed = errors
      .slice(0, MAX_LISTED_ERRORS)
      .map((e) => e.message)
      .join("; ");
    throw new Error(`SVG venue có ${errors.length} lỗi: ${listed}`);
  }
  return { editor: blockFromSvg(imported) };
}
