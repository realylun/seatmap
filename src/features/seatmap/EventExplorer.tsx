"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import {
  createListingGrouper,
  listingsFromGroups,
  pickSeats,
  type Listing,
  type ListingSort,
} from "@/domain/seats/listings";
import {
  recordRecentlyViewed,
  type ViewedEvent,
} from "@/features/home/recently-viewed";
import {
  filterListings,
  listingBadges,
  toggleTier,
} from "@/features/listing/listing-filters";
import { ListingPanel } from "@/features/listing/ListingPanel";
import { createHoldAction } from "@/server/actions/holds";
import { isSelectable } from "./availability";
import type { FlyRequest } from "./SeatMap";
import { SelectionBar } from "./SelectionBar";
import { selectionReducer, selectionTotal } from "./selection";
import { useAvailability } from "./use-availability";

const SeatMap = dynamic(() => import("./SeatMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#eef0f6] text-sm text-muted">
      Loading seat map…
    </div>
  ),
});

type Props = {
  eventId: string;
  geometryUrl: string;
  overviewUrl: string | null;
  canBuy: boolean;
  viewed: ViewedEvent;
};

const NO_TIERS: ReadonlySet<string> = new Set();

function useListingState(eventId: string) {
  const availability = useAvailability(eventId);
  const [quantity, setQuantity] = useState(1);
  const [sort, setSort] = useState<ListingSort>("price-asc");
  const [tierIds, setTierIds] = useState(NO_TIERS);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const { data } = availability;
  const [grouper] = useState(createListingGrouper);
  const groups = useMemo(
    () => (data ? grouper.groupsFor(data.seats) : null),
    [grouper, data],
  );

  const listings = useMemo(
    () => (groups ? listingsFromGroups(groups, { quantity, sort }) : []),
    [groups, quantity, sort],
  );
  const mapListings = useMemo(
    () => filterListings(listings, { tierIds, section: null }),
    [listings, tierIds],
  );
  const badges = useMemo(() => listingBadges(mapListings), [mapListings]);
  const visible = useMemo(
    () =>
      filterListings(mapListings, {
        tierIds: NO_TIERS,
        section: selectedSection,
      }),
    [mapListings, selectedSection],
  );
  const seatBySid = useMemo(
    () => new Map(data?.seats.map((s) => [s.sid, s]) ?? []),
    [data],
  );
  return {
    availability,
    filters: { quantity, setQuantity, sort, setSort, tierIds, setTierIds },
    selectedSection,
    setSelectedSection,
    mapListings,
    badges,
    visible,
    seatBySid,
  };
}

export function EventExplorer({
  eventId,
  geometryUrl,
  overviewUrl,
  canBuy,
  viewed,
}: Props) {
  const state = useListingState(eventId);
  const { availability, filters, seatBySid } = state;
  const [selection, dispatch] = useReducer(selectionReducer, []);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    recordRecentlyViewed(viewed);
  }, [viewed]);

  useEffect(() => {
    dispatch({
      type: "prune",
      isSelectable: (sid) => isSelectable(seatBySid.get(sid)),
    });
  }, [seatBySid]);

  const flyTo = useCallback((section: string) => {
    setFlyRequest((prev) => ({ section, key: (prev?.key ?? 0) + 1 }));
  }, []);

  const { setSelectedSection } = state;
  const onSelectSection = useCallback(
    (section: string | null) => {
      setSelectedSection(section);
      if (section) flyTo(section);
    },
    [flyTo, setSelectedSection],
  );

  const onSeatClick = useCallback(
    (sid: string) => {
      if (!canBuy || !isSelectable(seatBySid.get(sid))) return;
      setHoldError(null);
      dispatch({ type: "toggle", sid });
    },
    [canBuy, seatBySid],
  );

  const { quantity } = filters;
  const onPick = useCallback(
    (listing: Listing) => {
      flyTo(listing.section);
      if (!canBuy) return;
      const sids = pickSeats(listing, quantity);
      if (!sids) return;
      setHoldError(null);
      dispatch({ type: "replace", sids });
    },
    [flyTo, canBuy, quantity],
  );

  const onHold = () => {
    setHoldError(null);
    startTransition(async () => {
      const result = await createHoldAction(eventId, [...selection]);
      // Thành công → server redirect sang /checkout, không có kết quả trả về
      if (!result) return;
      setHoldError(result.message);
      if (result.reason === "SEATS_TAKEN") {
        const taken = new Set(result.takenSids);
        dispatch({ type: "prune", isSelectable: (sid) => !taken.has(sid) });
        await availability.refresh(true);
      }
    });
  };

  const total = selectionTotal(
    selection,
    (sid) => seatBySid.get(sid)?.price ?? null,
  );

  return (
    <div className="flex flex-col lg:grid lg:h-[calc(100dvh-9rem)] lg:min-h-[560px] lg:grid-cols-[minmax(340px,37%)_1fr]">
      <div className="order-2 flex min-h-0 flex-col border-r border-line lg:order-1">
        <ListingPanel
          listings={state.visible}
          badges={state.badges}
          tiers={availability.data?.tiers ?? []}
          loading={!availability.data}
          error={availability.error}
          canBuy={canBuy}
          quantity={filters.quantity}
          onQuantity={filters.setQuantity}
          tierIds={filters.tierIds}
          onToggleTier={(id) =>
            filters.setTierIds((ids) => toggleTier(ids, id))
          }
          sort={filters.sort}
          onSort={filters.setSort}
          hoveredSection={hoveredSection}
          selectedSection={state.selectedSection}
          onHover={setHoveredSection}
          onClearSection={() => setSelectedSection(null)}
          onPick={onPick}
        />
        <SelectionBar
          selection={selection}
          total={total}
          pending={pending}
          error={holdError}
          onClear={() => dispatch({ type: "clear" })}
          onHold={onHold}
        />
      </div>
      <div
        data-testid="seat-map"
        className="order-1 h-[55vh] min-h-[360px] lg:order-2 lg:h-full"
      >
        <SeatMap
          eventId={eventId}
          geometryUrl={geometryUrl}
          overviewUrl={overviewUrl}
          availability={availability.data}
          listings={state.mapListings}
          selection={selection}
          hoveredSection={hoveredSection}
          selectedSection={state.selectedSection}
          flyRequest={flyRequest}
          onHoverSection={setHoveredSection}
          onSelectSection={onSelectSection}
          onSeatClick={onSeatClick}
        />
      </div>
    </div>
  );
}
