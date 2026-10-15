// Khoảng cách ghế đặc trưng của venue để vẽ ghế đúng tỉ lệ (bán kính theo toạ độ thật, không cố định
// pixel). Tốn ~0,6 s với venue 135k ghế nên publish tính sẵn (venue.seatSpacing); client chỉ tính lại
// với file cũ chưa có giá trị này.
import type { Point } from "./types";

/** Dạng tối thiểu cần đọc: ghế từ venue.json hoặc đã gắn `sid` ở client */
export type SeatCollection = {
  readonly features: readonly {
    readonly properties: Readonly<Record<string, unknown>>;
    readonly geometry: { readonly coordinates: unknown };
  }[];
};

const isPoint = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");

type SeatProps = { section?: unknown };

function seatsBySection(seats: SeatCollection): Point[][] {
  const groups = new Map<string, Point[]>();
  for (const f of seats.features) {
    const { section } = f.properties as SeatProps;
    const p = f.geometry.coordinates;
    if (!isPoint(p)) continue;
    const key = String(section);
    const group = groups.get(key);
    // push vào mảng cục bộ: copy mảng mỗi ghế là O(n²) với khu hàng nghìn ghế
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

/** Số ghế mẫu tối đa mỗi khu: trung vị chỉ cần ước lượng, đo hết là O(n²) với khu sân 100k+ ghế */
const MAX_SAMPLES_PER_SECTION = 256;

function nearestDistances(points: readonly Point[]): number[] {
  const stride = Math.max(1, points.length / MAX_SAMPLES_PER_SECTION);
  const samples = Array.from(
    { length: Math.min(points.length, MAX_SAMPLES_PER_SECTION) },
    (_, k) => Math.floor(k * stride),
  );
  return samples.flatMap((i) => {
    const p = points[i];
    const nearest = points.reduce(
      (best, q, j) =>
        j === i ? best : Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1])),
      Infinity,
    );
    return Number.isFinite(nearest) ? [nearest] : [];
  });
}

/**
 * Khoảng cách trung vị từ mỗi ghế tới ghế gần nhất cùng section (đơn vị toạ độ map) — lấy min của
 * khoảng cách ghế và khoảng cách row để ghế không đè nhau; 0 nếu không có ghế. Khu lớn chỉ lấy mẫu
 * (MAX_SAMPLES_PER_SECTION ghế, so với mọi ghế cùng khu).
 */
export function medianSeatSpacing(seats: SeatCollection): number {
  const gaps = seatsBySection(seats)
    .flatMap(nearestDistances)
    .filter((g) => g > 0)
    .toSorted((a, b) => a - b);
  if (gaps.length === 0) return 0;
  return gaps[Math.floor(gaps.length / 2)];
}
