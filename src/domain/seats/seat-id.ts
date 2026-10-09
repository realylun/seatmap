// Seat id thống nhất toàn hệ thống: sid = "section|row|seat" (convention của seatmap-demo/style.js —
// promoteId của layer ghế, khoá availability, khoá chọn ghế).
const SEPARATOR = "|";

export type SeatKey = {
  readonly section: string;
  readonly row: string;
  readonly seat: string;
};

function assertPart(name: string, value: string) {
  if (value === "" || value.includes(SEPARATOR)) {
    throw new Error(
      `Seat ${name} không hợp lệ: "${value}" (không được rỗng hoặc chứa "${SEPARATOR}")`,
    );
  }
}

export function encodeSid({ section, row, seat }: SeatKey): string {
  assertPart("section", section);
  assertPart("row", row);
  assertPart("seat", seat);
  return [section, row, seat].join(SEPARATOR);
}

export function decodeSid(sid: string): SeatKey {
  const parts = sid.split(SEPARATOR);
  const isValid = parts.length === 3 && parts.every((p) => p !== "");
  if (!isValid)
    throw new Error(
      `Seat id không hợp lệ: "${sid}" (cần dạng "section|row|seat")`,
    );
  const [section, row, seat] = parts;
  return { section, row, seat };
}

/** Khoá row ("section|row") — dùng cho rowMinPrice / promoteId layer row */
export function rowKey(section: string, row: string): string {
  return `${section}${SEPARATOR}${row}`;
}
