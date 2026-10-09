// Giải mã payload gọn của /api/events/[id]/availability → SeatAvailability cho listing + map.
import { z } from "zod";
import type { SeatAvailability, SeatStatus } from "@/domain/seats/listings";

/** Thứ tự khớp SEAT_STATUS_CODE ở server/inventory/db.ts */
export const STATUS_BY_CODE: readonly SeatStatus[] = [
  "available",
  "held",
  "sold",
  "blocked",
];

const tierSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().int(),
  color: z.string(),
});

export const availabilityPayloadSchema = z.object({
  tiers: z.array(tierSchema),
  seats: z.array(
    z.tuple([
      z.string(),
      z.number().int().min(-1),
      z.number().int().min(0).max(3),
    ]),
  ),
});

export type AvailabilityPayload = z.infer<typeof availabilityPayloadSchema>;
export type Tier = z.infer<typeof tierSchema>;

export type DecodedAvailability = {
  readonly tiers: readonly Tier[];
  readonly seats: readonly SeatAvailability[];
  readonly tierBySid: ReadonlyMap<string, Tier>;
};

export function decodeAvailability(json: unknown): DecodedAvailability {
  const parsed = availabilityPayloadSchema.safeParse(json);
  if (!parsed.success) throw new Error("Availability response is invalid");
  const { tiers, seats } = parsed.data;
  const decoded = seats.map(([sid, tierIdx, code]) => {
    const tier = tiers[tierIdx] as Tier | undefined;
    return {
      sid,
      tier,
      seat: {
        sid,
        tierId: tier?.id ?? null,
        price: tier?.price ?? null,
        status: STATUS_BY_CODE[code],
      } satisfies SeatAvailability,
    };
  });
  return {
    tiers,
    seats: decoded.map((d) => d.seat),
    tierBySid: new Map(
      decoded.flatMap((d) => (d.tier ? [[d.sid, d.tier] as const] : [])),
    ),
  };
}

/** Ghế có thể chọn: còn trống và đã gán tier (giá) */
export function isSelectable(seat: SeatAvailability | undefined): boolean {
  return seat?.status === "available" && seat.tierId !== null;
}

export type SeatCounts = Readonly<Record<"total" | SeatStatus, number>>;

/** Đếm ghế theo trạng thái → badge sức chứa góc phải seat map */
export function seatCounts(seats: readonly SeatAvailability[]): SeatCounts {
  const byStatus = Map.groupBy(seats, (s) => s.status);
  const count = (status: SeatStatus) => byStatus.get(status)?.length ?? 0;
  return {
    total: seats.length,
    available: count("available"),
    held: count("held"),
    sold: count("sold"),
    blocked: count("blocked"),
  };
}
