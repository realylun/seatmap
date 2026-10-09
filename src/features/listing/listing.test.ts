import { describe, expect, it } from "vitest";
import { buildListings, type SeatAvailability } from "@/domain/seats/listings";
import { formatRemaining } from "@/features/checkout/format";
import {
  filterListings,
  listingBadges,
  seatRangeLabel,
  toggleTier,
} from "./listing-filters";

const seat = (
  sid: string,
  tierId: string,
  price: number,
): SeatAvailability => ({
  sid,
  tierId,
  price,
  status: "available",
});

const listings = buildListings([
  seat("101|A|1", "t1", 100),
  seat("101|A|2", "t1", 100),
  seat("101|A|3", "t1", 100),
  seat("102|B|7", "t2", 300),
]);

describe("listing filters", () => {
  it("filters by tier and section", () => {
    expect(
      filterListings(listings, { tierIds: new Set(), section: null }),
    ).toHaveLength(2);
    expect(
      filterListings(listings, { tierIds: new Set(["t2"]), section: null }).map(
        (l) => l.section,
      ),
    ).toEqual(["102"]);
    expect(
      filterListings(listings, { tierIds: new Set(), section: "101" }),
    ).toHaveLength(1);
    expect(
      filterListings(listings, { tierIds: new Set(["t2"]), section: "101" }),
    ).toHaveLength(0);
  });

  it("labels the seats that would be auto-picked", () => {
    expect(seatRangeLabel(listings[0], 1)).toBe("Seat 1");
    expect(seatRangeLabel(listings[0], 3)).toBe("Seats 1–3");
    expect(seatRangeLabel(listings[0], 4)).toBe("");
  });

  it("toggles tiers immutably", () => {
    const empty = new Set<string>();
    const one = toggleTier(empty, "t1");
    expect([...one]).toEqual(["t1"]);
    expect(empty.size).toBe(0);
    expect([...toggleTier(one, "t1")]).toEqual([]);
  });
});

describe("formatRemaining", () => {
  it("renders mm:ss and never goes negative", () => {
    expect(formatRemaining(600_000)).toBe("10:00");
    expect(formatRemaining(61_500)).toBe("01:02");
    expect(formatRemaining(-5)).toBe("00:00");
  });
});

describe("listingBadges", () => {
  it("gives one Cheapest overall and one Cheapest in section per section", () => {
    const tied = buildListings([
      seat("101|A|1", "t1", 100),
      seat("101|B|1", "t1", 100),
      seat("102|A|1", "t1", 100),
      seat("102|B|1", "t2", 100),
      seat("103|A|1", "t2", 300),
      seat("103|B|1", "t2", 500),
    ]);
    const badges = listingBadges(tied);
    const byBadge = (b: string) =>
      tied
        .filter((l) => badges.get(l.id) === b)
        .map((l) => `${l.section}${l.row}`);
    expect(byBadge("cheapest")).toEqual(["101A"]);
    expect(byBadge("cheapest-in-section")).toEqual(["102A", "103A"]);
    expect(listingBadges([]).size).toBe(0);
  });
});
