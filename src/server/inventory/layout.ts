import { asc, eq } from "drizzle-orm";
import { eventSeats, priceTiers } from "@/db/schema";
import type { Db } from "./db";
import { checkedSids, sidsAggSql } from "./seat-sql";

export type TierInfo = {
  id: string;
  name: string;
  price: number;
  color: string;
};

export type SeatLayout = {
  /** Theo giá tăng dần, rồi id */
  tiers: TierInfo[];
  /** [tierIdx or -1, sids] — mọi ghế của event, gom theo tier */
  groups: [number, string[]][];
};

/** Tiers của event theo giá rồi id (thứ tự index dùng trong payload) */
function getTiers(db: Db, eventId: string): Promise<TierInfo[]> {
  return db
    .select({
      id: priceTiers.id,
      name: priceTiers.name,
      price: priceTiers.price,
      color: priceTiers.color,
    })
    .from(priceTiers)
    .where(eq(priceTiers.eventId, eventId))
    .orderBy(asc(priceTiers.price), asc(priceTiers.id));
}

/**
 * Bố cục tĩnh (chỉ đổi khi admin gán tier): Postgres gom sid theo tier_id → vài dòng thay vì
 * một dòng mỗi ghế. Ghế chưa có tier nằm ở nhóm -1.
 */
export async function getSeatLayout(
  db: Db,
  eventId: string,
): Promise<SeatLayout> {
  const tiers = await getTiers(db, eventId);
  const tierIdx = new Map(tiers.map((t, i) => [t.id, i]));
  const rows = await db
    .select({ tierId: eventSeats.tierId, sids: sidsAggSql })
    .from(eventSeats)
    .where(eq(eventSeats.eventId, eventId))
    .groupBy(eventSeats.tierId);
  const groups = rows.map(({ tierId, sids }): [number, string[]] => [
    tierId ? (tierIdx.get(tierId) ?? -1) : -1,
    checkedSids(sids),
  ]);
  return { tiers, groups };
}
