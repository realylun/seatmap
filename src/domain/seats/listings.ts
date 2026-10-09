// Availability từng ghế → listing hiển thị bên panel trái + giá cho price pin trên map.
// Listing = nhóm ghế còn trống cùng (section, row, tier); ghế chỉ bán được khi đã gán tier + giá.
import { decodeSid, rowKey } from "./seat-id";

export type SeatStatus = "available" | "held" | "sold" | "blocked";

export type SeatAvailability = {
  readonly sid: string;
  readonly tierId: string | null;
  readonly price: number | null;
  readonly status: SeatStatus;
};

/** Dải ghế liền nhau (số ghế liên tiếp) trong 1 row, theo thứ tự số ghế tăng dần */
export type SeatRun = {
  readonly seats: readonly string[];
  readonly sids: readonly string[];
};

export type Listing = {
  readonly id: string;
  readonly section: string;
  readonly row: string;
  readonly tierId: string;
  readonly price: number;
  readonly availableCount: number;
  readonly runs: readonly SeatRun[];
  readonly maxRun: number;
  readonly isCheapest: boolean;
  readonly isCheapestInSection: boolean;
};

export type ListingSort = "price-asc" | "price-desc";

export type ListingQuery = {
  /** Số vé muốn mua — listing phải có dải liền nhau ≥ quantity */
  readonly quantity?: number;
  readonly sort?: ListingSort;
};

type SellableSeat = {
  readonly sid: string;
  readonly section: string;
  readonly row: string;
  readonly seat: string;
  readonly tierId: string;
  readonly price: number;
};

type Group = Omit<Listing, "isCheapest" | "isCheapestInSection">;

const natural = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true });

const isNumber = (s: string) => /^\d+$/.test(s);

const isNextSeat = (prev: string, next: string) =>
  isNumber(prev) && isNumber(next) && Number(next) === Number(prev) + 1;

function toSellable(seats: readonly SeatAvailability[]): SellableSeat[] {
  return seats.flatMap((s) =>
    s.status === "available" && s.tierId !== null && s.price !== null
      ? [{ ...decodeSid(s.sid), sid: s.sid, tierId: s.tierId, price: s.price }]
      : [],
  );
}

function toRuns(sorted: readonly SellableSeat[]): SeatRun[] {
  const starts = sorted.flatMap((s, i) =>
    i === 0 || !isNextSeat(sorted[i - 1].seat, s.seat) ? [i] : [],
  );
  return starts.map((start, k) => {
    const run = sorted.slice(start, starts[k + 1]);
    return { seats: run.map((s) => s.seat), sids: run.map((s) => s.sid) };
  });
}

function toGroup(id: string, seats: readonly SellableSeat[]): Group {
  const sorted = seats.toSorted((a, b) => natural(a.seat, b.seat));
  const runs = toRuns(sorted);
  const [first] = sorted;
  return {
    id,
    section: first.section,
    row: first.row,
    tierId: first.tierId,
    price: Math.min(...sorted.map((s) => s.price)),
    availableCount: sorted.length,
    runs,
    maxRun: Math.max(...runs.map((r) => r.seats.length)),
  };
}

function groupSeats(seats: readonly SellableSeat[]): Group[] {
  const buckets = Map.groupBy(
    seats,
    (s) => `${s.section}|${s.row}|${s.tierId}`,
  );
  return [...buckets].map(([id, items]) => toGroup(id, items));
}

function compareGroups(sort: ListingSort) {
  const direction = sort === "price-desc" ? -1 : 1;
  return (a: Group, b: Group) =>
    direction * (a.price - b.price) ||
    natural(a.section, b.section) ||
    natural(a.row, b.row) ||
    natural(a.tierId, b.tierId);
}

function withFlags(groups: readonly Group[]): Listing[] {
  const overallMin = Math.min(...groups.map((g) => g.price));
  const sectionMin = minBy(groups, (g) => g.section);
  return groups.map((g) => ({
    ...g,
    isCheapest: g.price === overallMin,
    isCheapestInSection: g.price === sectionMin.get(g.section),
  }));
}

type Priced = Pick<Listing, "price" | "section" | "row">;

// Map kết quả là cục bộ, chỉ ghi khi build → không đụng input
function minBy(
  items: readonly Priced[],
  key: (l: Priced) => string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    const current = result.get(key(item));
    if (current === undefined || item.price < current)
      result.set(key(item), item.price);
  }
  return result;
}

/** Listing đã lọc theo quantity, sắp theo giá; cờ cheapest tính trên tập sau khi lọc */
export function buildListings(
  seats: readonly SeatAvailability[],
  query: ListingQuery = {},
): Listing[] {
  const { quantity = 1, sort = "price-asc" } = query;
  const groups = groupSeats(toSellable(seats))
    .filter((g) => g.maxRun >= quantity)
    .toSorted(compareGroups(sort));
  return withFlags(groups);
}

/** Giá rẻ nhất theo section → price pin ở zoom section */
export function sectionMinPrice(
  listings: readonly Listing[],
): ReadonlyMap<string, number> {
  return minBy(listings, (l) => l.section);
}

/** Giá rẻ nhất theo row (khoá rowKey "section|row") → price pin ở zoom row */
export function rowMinPrice(
  listings: readonly Listing[],
): ReadonlyMap<string, number> {
  return minBy(listings, (l) => rowKey(l.section, l.row));
}

/** Chọn `quantity` ghế liền nhau đầu tiên trong listing → sids, hoặc null nếu không đủ */
export function pickSeats(
  listing: Pick<Listing, "runs">,
  quantity: number,
): readonly string[] | null {
  const run = listing.runs.find((r) => r.sids.length >= quantity);
  return run ? run.sids.slice(0, quantity) : null;
}
