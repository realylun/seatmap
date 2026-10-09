// Lọc/hiển thị listing phía client (bổ sung cho buildListings: quantity + sort đã xử lý ở domain).
import { pickSeats, type Listing } from "@/domain/seats/listings";
import { decodeSid } from "@/domain/seats/seat-id";

export const QUANTITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type ListingFilter = {
  /** Rỗng = mọi tier */
  readonly tierIds: ReadonlySet<string>;
  readonly section: string | null;
};

export function filterListings(
  listings: readonly Listing[],
  { tierIds, section }: ListingFilter,
): Listing[] {
  return listings.filter(
    (l) =>
      (tierIds.size === 0 || tierIds.has(l.tierId)) &&
      (section === null || l.section === section),
  );
}

/** "Seat 12" / "Seats 12–13" theo dải ghế sẽ được tự chọn cho `quantity` vé */
export function seatRangeLabel(
  listing: Pick<Listing, "runs">,
  quantity: number,
): string {
  const sids = pickSeats(listing, quantity);
  if (!sids || sids.length === 0) return "";
  const seats = sids.map((sid) => decodeSid(sid).seat);
  if (seats.length === 1) return `Seat ${seats[0]}`;
  return `Seats ${seats[0]}–${seats.at(-1)}`;
}

/** Bật/tắt 1 tier trong bộ lọc (trả Set mới) */
export function toggleTier(
  tierIds: ReadonlySet<string>,
  tierId: string,
): ReadonlySet<string> {
  const next = new Set(tierIds);
  if (next.has(tierId)) next.delete(tierId);
  else next.add(tierId);
  return next;
}

export type ListingBadge = "cheapest" | "cheapest-in-section";

/**
 * Badge hiển thị: đúng 1 "Cheapest" (listing rẻ nhất đầu tiên theo thứ tự đang hiển thị) và
 * 1 "Cheapest in section" mỗi section. Domain đặt cờ cho mọi listing đồng giá → chọn 1 ở đây.
 */
export function listingBadges(
  listings: readonly Listing[],
): ReadonlyMap<string, ListingBadge> {
  const minPrice = Math.min(...listings.map((l) => l.price));
  const winner = listings.find((l) => l.price === minPrice);
  const sectionMin = new Map<string, number>();
  for (const l of listings) {
    const current = sectionMin.get(l.section);
    if (current === undefined || l.price < current)
      sectionMin.set(l.section, l.price);
  }
  const badges = new Map<string, ListingBadge>();
  if (winner) badges.set(winner.id, "cheapest");
  const taken = new Set(winner ? [winner.section] : []);
  for (const l of listings) {
    if (taken.has(l.section) || l.price !== sectionMin.get(l.section)) continue;
    taken.add(l.section);
    badges.set(l.id, "cheapest-in-section");
  }
  return badges;
}

/** Số listing render mỗi đợt: sân lớn có hàng nghìn listing, render hết một lần treo UI vài giây */
export const LISTING_PAGE_SIZE = 50;

/** Số listing render sau khi cuộn tới cuối: thêm một đợt, không vượt tổng */
export function nextRenderCount(current: number, total: number): number {
  return Math.min(current + LISTING_PAGE_SIZE, total);
}
