// Giải mã 2 payload gọn: /api/events/[id]/layout (tier của mọi ghế, tải một lần) +
// /api/events/[id]/availability (chỉ ghế không trống, poll) → SeatAvailability cho listing + map.
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

const layoutSchema = z.object({
  tiers: z.array(tierSchema),
  /** [tierIdx or -1, sids] */
  groups: z.array(z.tuple([z.number().int().min(-1), z.array(z.string())])),
});

const statusSchema = z.object({
  /** [sid, statusCode] — chỉ ghế không trống */
  seats: z.array(z.tuple([z.string(), z.number().int().min(0).max(3)])),
});

export type LayoutPayload = z.infer<typeof layoutSchema>;
export type StatusPayload = z.infer<typeof statusSchema>;
export type Tier = z.infer<typeof tierSchema>;

export type DecodedAvailability = {
  readonly tiers: readonly Tier[];
  readonly seats: readonly SeatAvailability[];
  readonly tierBySid: ReadonlyMap<string, Tier>;
};

export function parseLayout(json: unknown): LayoutPayload {
  const parsed = layoutSchema.safeParse(json);
  if (!parsed.success) throw new Error("Seat layout response is invalid");
  return parsed.data;
}

export function parseStatus(json: unknown): StatusPayload {
  const parsed = statusSchema.safeParse(json);
  if (!parsed.success) throw new Error("Availability response is invalid");
  return parsed.data;
}

/** Ghép layout + status: ghế có trong layout mà vắng ở status là "available"; sid lạ ở status bị bỏ qua. */
export function mergeAvailability(
  layout: LayoutPayload,
  status: StatusPayload,
): DecodedAvailability {
  const { tiers, groups } = layout;
  const codeBySid = new Map(status.seats);
  const decoded = groups.flatMap(([tierIdx, sids]) => {
    const tier = tiers[tierIdx] as Tier | undefined;
    return sids.map((sid) => ({
      sid,
      tier,
      seat: {
        sid,
        tierId: tier?.id ?? null,
        price: tier?.price ?? null,
        status: STATUS_BY_CODE[codeBySid.get(sid) ?? 0],
      } satisfies SeatAvailability,
    }));
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
