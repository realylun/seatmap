// Kế hoạch bán vé giả lập: mỗi đơn là một cụm ghế liền nhau trong cùng một hàng. Tỉ lệ bán của
// mỗi section (zone) theo hạng vé (rank 0 = đắt nhất, bán chạy nhất) × nhu cầu của event × nhiễu,
// thỉnh thoảng một section bán hết. Thuần (rng tiêm vào) để test và cho cùng kết quả với cùng seed.
import { MAX_HOLD_SEATS } from "@/server/inventory/holds";

export type SaleSeat = {
  readonly id: number;
  readonly section: string;
  readonly row: string;
  readonly seat: string;
  readonly tierRank: number;
  /** false = đã bán/giữ; vẫn nằm trong kế hoạch để chạy lại ra cùng kế hoạch (mặc định true) */
  readonly available?: boolean;
};

export type SalesOptions = {
  readonly rng: () => number;
  /** Tỉ lệ bán gốc theo rank hạng vé; rank vượt quá dùng phần tử cuối */
  readonly tierRates: readonly number[];
  /** Hệ số nhu cầu của event (1 = bình thường) */
  readonly demand: number;
  /** Xác suất một section bán sạch */
  readonly soldOutChance: number;
};

// Cỡ đơn hay gặp: mua đôi, nhóm 3–4, thỉnh thoảng nhóm lớn
const ORDER_SIZES = [1, 2, 2, 2, 3, 4, 4, 6, MAX_HOLD_SEATS] as const;
const MAX_RATE = 0.97;

const byNatural = new Intl.Collator("en", { numeric: true }).compare;

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item); // local accumulator; copying would be O(n²) on 135k seats
    else out.set(k, [item]);
  }
  return out;
}

function sectionRate(tierRank: number, opts: SalesOptions): number {
  if (opts.rng() < opts.soldOutChance) return 1;
  const base = opts.tierRates[Math.min(tierRank, opts.tierRates.length - 1)];
  const jitter = 0.5 + opts.rng(); // 0.5–1.5
  return Math.min(MAX_RATE, Math.max(0, base * opts.demand * jitter));
}

/** Chia một hàng thành các cụm liền nhau; mỗi cụm được mua với xác suất `rate` */
function planRow(row: readonly SaleSeat[], rate: number, rng: () => number) {
  const sorted = row.toSorted((a, b) => byNatural(a.seat, b.seat));
  const groups: number[][] = [];
  for (let i = 0; i < sorted.length;) {
    const size = ORDER_SIZES[Math.floor(rng() * ORDER_SIZES.length)];
    const block = sorted.slice(i, i + size).map((s) => s.id);
    if (rate >= 1 || rng() < rate) groups.push(block);
    i += size;
  }
  return groups;
}

/**
 * Danh sách đơn (mỗi đơn ≤ 8 seat id liền nhau trong một hàng), không ghế nào lặp. Kế hoạch lập
 * trên toàn bộ ghế rồi chỉ giữ đơn mà mọi ghế còn trống → chạy lại cùng seed sẽ bán tiếp phần dở.
 */
export function planSales(
  seats: readonly SaleSeat[],
  opts: SalesOptions,
): number[][] {
  const taken = new Set(
    seats.filter((s) => s.available === false).map((s) => s.id),
  );
  return planAll(seats, opts).filter((g) => g.every((id) => !taken.has(id)));
}

function planAll(seats: readonly SaleSeat[], opts: SalesOptions): number[][] {
  const sections = [...groupBy(seats, (s) => s.section)].toSorted(([a], [b]) =>
    byNatural(a, b),
  );
  return sections.flatMap(([, sectionSeats]) => {
    const rank = Math.min(...sectionSeats.map((s) => s.tierRank));
    const rate = sectionRate(rank, opts);
    const rows = [...groupBy(sectionSeats, (s) => s.row)].toSorted(([a], [b]) =>
      byNatural(a, b),
    );
    return rows.flatMap(([, row]) => planRow(row, rate, opts.rng));
  });
}
