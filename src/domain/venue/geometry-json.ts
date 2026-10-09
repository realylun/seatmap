// Geometry venue → JSON để upload. Toạ độ ghế sinh tự động là float đầy đủ (17 chữ số); làm tròn 6
// chữ số thập phân (≈ 1/170000 chiều cao venue, cùng độ chính xác với import SVG) giảm ~một nửa
// dung lượng gzip với venue 100k+ ghế. Làm tròn lúc serialize để buildVenue giữ nguyên kết quả.
const PRECISION = 1e6;

const roundNumber = (_key: string, value: unknown) =>
  typeof value === "number" && !Number.isInteger(value)
    ? Math.round(value * PRECISION) / PRECISION || 0
    : value;

export function serializeGeometry(venue: unknown): string {
  return JSON.stringify(venue, roundNumber);
}
