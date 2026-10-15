"use client";

import { memo } from "react";
import type { Listing } from "@/domain/seats/listings";
import { formatVnd } from "@/domain/pricing/money";
import { seatRangeLabel, type ListingBadge } from "./listing-filters";

type Props = {
  listing: Listing;
  badge: ListingBadge | null;
  quantity: number;
  tierName: string;
  tierColor: string;
  hovered: boolean;
  onHover: (section: string | null) => void;
  onPick: (listing: Listing) => void;
};

function Badge({ badge }: { badge: ListingBadge | null }) {
  if (badge === "cheapest") {
    return (
      <span className="text-sm font-semibold text-emerald-700">Cheapest</span>
    );
  }
  if (badge === "cheapest-in-section") {
    return (
      <span className="text-sm font-semibold text-emerald-700">
        Cheapest in section
      </span>
    );
  }
  return null;
}

// memo: hover section trên map đổi `hoveredSection` → chỉ thẻ đổi `hovered` mới render lại.
// Không memo thì mỗi lần rê chuột sang section khác render lại cả danh sách (tụt FPS khi xem 1 section).
// Các callback truyền vào phải giữ nguyên tham chiếu (useCallback ở EventExplorer).
export const ListingCard = memo(function ListingCard(props: Props) {
  const { listing, quantity, hovered } = props;
  const seats = seatRangeLabel(listing, quantity);
  return (
    <li data-testid="listing-card">
      <button
        type="button"
        aria-label={`Section ${listing.section}, Row ${listing.row}${seats ? `, ${seats}` : ""}, ${formatVnd(listing.price)} per ticket`}
        onMouseEnter={() => props.onHover(listing.section)}
        onMouseLeave={() => props.onHover(null)}
        onFocus={() => props.onHover(listing.section)}
        onBlur={() => props.onHover(null)}
        onClick={() => props.onPick(listing)}
        className={`flex w-full items-start gap-4 border-b border-line px-4 py-4 text-left transition-colors sm:px-5 ${
          hovered ? "bg-gray-50" : "bg-white hover:bg-gray-50"
        }`}
      >
        <span
          aria-hidden
          className="mt-1.5 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: props.tierColor }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">
            Section {listing.section}
          </span>
          <span className="block text-muted">
            Row {listing.row}
            {seats ? `, ${seats}` : ""}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {props.tierName} · {listing.availableCount} available
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold">
            {formatVnd(listing.price)}
          </span>
          <span className="block text-sm text-muted">per ticket</span>
          <span className="mt-1 block">
            <Badge badge={props.badge} />
          </span>
        </span>
      </button>
    </li>
  );
});
