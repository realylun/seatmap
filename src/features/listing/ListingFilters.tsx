"use client";

import type { ListingSort } from "@/domain/seats/listings";
import { formatVnd } from "@/domain/pricing/money";
import type { Tier } from "@/features/seatmap/availability";
import { QUANTITY_OPTIONS } from "./listing-filters";

type Props = {
  quantity: number;
  onQuantity: (quantity: number) => void;
  tiers: readonly Tier[];
  tierIds: ReadonlySet<string>;
  onToggleTier: (tierId: string) => void;
  sort: ListingSort;
  onSort: (sort: ListingSort) => void;
};

const chip =
  "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors";
const chipOn = "border-ink bg-ink text-white";
const chipOff = "border-line bg-white text-foreground hover:border-gray-400";

export function ListingFilters(props: Props) {
  return (
    <div className="border-b border-line">
      <div className="overflow-x-auto px-4 pt-3 sm:px-5">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Number of tickets</legend>
          {QUANTITY_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`qty-chip-${n}`}
              aria-pressed={props.quantity === n}
              onClick={() => props.onQuantity(n)}
              className={`${chip} ${props.quantity === n ? chipOn : chipOff}`}
            >
              {n === props.quantity
                ? `${n} ${n === 1 ? "ticket" : "tickets"}`
                : n}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-2 sm:px-5">
        {props.tiers.map((tier) => {
          const active = props.tierIds.has(tier.id);
          return (
            <button
              key={tier.id}
              type="button"
              aria-pressed={active}
              onClick={() => props.onToggleTier(tier.id)}
              className={`${chip} ${active ? chipOn : chipOff} flex items-center gap-2`}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: tier.color }}
              />
              {tier.name} · {formatVnd(tier.price)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end px-4 pb-2 sm:px-5">
        <button
          type="button"
          onClick={() =>
            props.onSort(
              props.sort === "price-asc" ? "price-desc" : "price-asc",
            )
          }
          className="text-sm text-muted hover:text-foreground"
        >
          Sort by price {props.sort === "price-asc" ? "↑" : "↓"}
        </button>
      </div>
    </div>
  );
}
