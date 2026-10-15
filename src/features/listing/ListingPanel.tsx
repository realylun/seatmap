"use client";

import { useDeferredValue, useEffect, useState } from "react";
import type { Listing, ListingSort } from "@/domain/seats/listings";
import type { Tier } from "@/features/seatmap/availability";
import { ListingCard } from "./ListingCard";
import {
  LISTING_PAGE_SIZE,
  nextRenderCount,
  type ListingBadge,
} from "./listing-filters";
import { ListingFilters } from "./ListingFilters";

type Props = {
  listings: readonly Listing[];
  /** Badge tính trên toàn bộ listing (trước khi lọc theo section) */
  badges: ReadonlyMap<string, ListingBadge>;
  tiers: readonly Tier[];
  loading: boolean;
  error: string | null;
  canBuy: boolean;
  quantity: number;
  onQuantity: (quantity: number) => void;
  tierIds: ReadonlySet<string>;
  onToggleTier: (tierId: string) => void;
  sort: ListingSort;
  onSort: (sort: ListingSort) => void;
  hoveredSection: string | null;
  selectedSection: string | null;
  onHover: (section: string | null) => void;
  onClearSection: () => void;
  onPick: (listing: Listing) => void;
};

function EmptyList({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null;
}) {
  const text =
    error ?? (loading ? "Loading tickets…" : "No tickets match your filters.");
  return (
    <output className="block px-5 py-10 text-center text-muted">{text}</output>
  );
}

/**
 * Render listing theo đợt: đợt đầu LISTING_PAGE_SIZE, cuộn tới sentinel cuối danh sách thì thêm
 * một đợt. Tổng số listing vẫn hiển thị đủ ở dòng "N listings". Đổi bộ lọc (`resetKey`) → về đợt đầu.
 */
function useRenderCount(total: number, resetKey: string) {
  const [count, setCount] = useState(LISTING_PAGE_SIZE);
  const [lastKey, setLastKey] = useState(resetKey);
  // Điều chỉnh state khi prop đổi ngay trong render (không cần effect + render thừa)
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setCount(LISTING_PAGE_SIZE);
  }
  // callback ref vào state: effect chạy lại khi sentinel mount/unmount
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);
  const hasMore = count < total;
  useEffect(() => {
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setCount(nextRenderCount(count, total));
      },
      // root = viewport: dưới breakpoint lg danh sách cao theo nội dung và trang cuộn, không phải <ul>.
      // `count` trong deps: observer tạo lại sau mỗi đợt nên sentinel vẫn trong vùng nhìn sẽ báo tiếp
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, total, count]);
  return { renderCount: count, hasMore, setSentinel };
}

export function ListingPanel(props: Props) {
  // Hover section trên map đổi nhiều thẻ cùng lúc (mọi listing của section đó): render ở mức ưu tiên
  // thấp, ngắt được, để không chặn frame của map khi rê chuột
  const hoveredSection = useDeferredValue(props.hoveredSection);
  const tierById = new Map(props.tiers.map((t) => [t.id, t]));
  const resetKey = [
    props.quantity,
    props.sort,
    [...props.tierIds].toSorted().join(","),
    props.selectedSection ?? "",
  ].join("|");
  const { renderCount, hasMore, setSentinel } = useRenderCount(
    props.listings.length,
    resetKey,
  );
  return (
    <section aria-label="Tickets" className="flex min-h-0 flex-col bg-white">
      <ListingFilters
        quantity={props.quantity}
        onQuantity={props.onQuantity}
        tiers={props.tiers}
        tierIds={props.tierIds}
        onToggleTier={props.onToggleTier}
        sort={props.sort}
        onSort={props.onSort}
      />
      {!props.canBuy && (
        <p className="border-b border-line bg-amber-50 px-5 py-2 text-sm text-amber-900">
          This event has ended. The seat map is view only.
        </p>
      )}
      {props.selectedSection && (
        <div className="flex items-center justify-between border-b border-line px-5 py-2 text-sm">
          <span>
            Showing <b>Section {props.selectedSection}</b>
          </span>
          <button
            type="button"
            onClick={props.onClearSection}
            className="font-semibold text-accent hover:underline"
          >
            Show all
          </button>
        </div>
      )}
      <p className="px-5 pt-3 text-sm text-muted" aria-live="polite">
        {props.listings.length} listings
      </p>
      {props.listings.length === 0 ? (
        <EmptyList loading={props.loading} error={props.error} />
      ) : (
        // key: đổi bộ lọc → <ul> mới, cuộn về đầu
        <ul key={resetKey} className="min-h-0 flex-1 overflow-y-auto">
          {props.listings.slice(0, renderCount).map((l) => {
            const tier = tierById.get(l.tierId);
            return (
              <ListingCard
                key={l.id}
                listing={l}
                badge={props.badges.get(l.id) ?? null}
                quantity={props.quantity}
                tierName={tier?.name ?? ""}
                tierColor={tier?.color ?? "#888888"}
                hovered={hoveredSection === l.section}
                onHover={props.onHover}
                onPick={props.onPick}
              />
            );
          })}
          {hasMore && <li ref={setSentinel} aria-hidden className="h-px" />}
        </ul>
      )}
    </section>
  );
}
