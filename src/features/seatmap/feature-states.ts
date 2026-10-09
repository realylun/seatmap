// feature-state cho section/row/ghế tính thuần từ availability + listing; map chỉ áp phần thay đổi
// (diff) để mỗi lần poll không phải set lại ~10k ghế.
import type { Listing, SeatAvailability } from "@/domain/seats/listings";
import { rowKey } from "@/domain/seats/seat-id";
import { STATUS_BY_CODE, type Tier } from "./availability";

export type StateValue = Readonly<
  Record<string, string | number | boolean | null>
>;
export type StateMap = ReadonlyMap<string, StateValue>;

/** Ghế: màu tier (null nếu chưa gán) + mã trạng thái (0 = trống) */
export function seatStates(
  seats: readonly SeatAvailability[],
  tierBySid: ReadonlyMap<string, Tier>,
): StateMap {
  return new Map(
    seats.map((s) => [
      s.sid,
      {
        color: tierBySid.get(s.sid)?.color ?? null,
        status: STATUS_BY_CODE.indexOf(s.status),
      },
    ]),
  );
}

type PricedListing = Pick<Listing, "section" | "row" | "price" | "tierId">;

/** Row có vé: màu tier của listing rẻ nhất trong row */
export function rowStates(
  listings: readonly PricedListing[],
  colorOf: (tierId: string) => string,
): StateMap {
  const cheapest = new Map<string, PricedListing>();
  for (const l of listings) {
    const key = rowKey(l.section, l.row);
    const current = cheapest.get(key);
    if (!current || l.price < current.price) cheapest.set(key, l);
  }
  return new Map(
    [...cheapest].map(([key, l]) => [key, { color: colorOf(l.tierId) }]),
  );
}

export function sectionStates(listings: readonly PricedListing[]): StateMap {
  return new Map(listings.map((l) => [l.section, { listed: true }]));
}

const sameState = (a: StateValue, b: StateValue) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
};

export type StateDiff = {
  readonly set: readonly (readonly [string, StateValue])[];
  readonly remove: readonly string[];
};

export function diffStates(prev: StateMap, next: StateMap): StateDiff {
  const set = [...next].filter(([id, value]) => {
    const old = prev.get(id);
    return !old || !sameState(old, value);
  });
  const remove = [...prev.keys()].filter((id) => !next.has(id));
  return { set, remove };
}
