// Mua vé giả lập qua đúng luồng của người dùng: createHold → confirmOrder (thanh toán giả lập).
import { and, eq, isNotNull } from "drizzle-orm";
import { eventSeats, priceTiers } from "@/db/schema";
import type { Db } from "@/server/inventory/db";
import { createHold } from "@/server/inventory/holds";
import { confirmOrder } from "@/server/inventory/orders";
import type { SaleSeat } from "./plan";

export type SellResult = { orders: number; seats: number; failed: number };

const BUYERS = [
  "Nguyễn Văn An",
  "Trần Thị Bình",
  "Lê Hoàng Cường",
  "Phạm Minh Đức",
  "Hoàng Thu Hà",
  "Vũ Quang Huy",
  "Đặng Ngọc Lan",
  "Bùi Thanh Mai",
  "Đỗ Gia Nam",
  "Ngô Phương Thảo",
] as const;

/** Mọi ghế đã gán hạng vé (kèm còn trống hay không); tierRank = thứ hạng giá (0 = đắt nhất) */
export async function loadSaleSeats(
  db: Db,
  eventId: string,
): Promise<SaleSeat[]> {
  const tiers = await db
    .select({ id: priceTiers.id, price: priceTiers.price })
    .from(priceTiers)
    .where(eq(priceTiers.eventId, eventId));
  const rankOf = new Map(
    tiers.toSorted((a, b) => b.price - a.price).map((t, i) => [t.id, i]),
  );
  const rows = await db
    .select({
      id: eventSeats.id,
      section: eventSeats.section,
      row: eventSeats.row,
      seat: eventSeats.seat,
      tierId: eventSeats.tierId,
      status: eventSeats.status,
    })
    .from(eventSeats)
    .where(and(eq(eventSeats.eventId, eventId), isNotNull(eventSeats.tierId)));
  return rows.map(({ tierId, status, ...seat }) => ({
    ...seat,
    tierRank: rankOf.get(tierId ?? "") ?? tiers.length,
    available: status === "available",
  }));
}

async function buyOne(db: Db, eventId: string, seatIds: number[], n: number) {
  const sessionId = `sim-${crypto.randomUUID()}`;
  const hold = await createHold(db, { eventId, seatIds, sessionId });
  if (!hold.ok) return false;
  const name = BUYERS[n % BUYERS.length];
  const order = await confirmOrder(db, {
    holdId: hold.holdId,
    sessionId,
    buyerName: name,
    buyerEmail: `buyer${n}@example.com`,
  });
  return order.ok;
}

/** Mua từng nhóm ghế (song song tối đa `concurrency`); nhóm lỗi được đếm, không dừng cả lô */
export async function sellGroups(
  db: Db,
  eventId: string,
  groups: readonly number[][],
  {
    concurrency = 1,
    onProgress,
  }: { concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<SellResult> {
  let next = 0;
  let done = 0;
  const outcomes: boolean[] = Array.from(
    { length: groups.length },
    () => false,
  );
  const worker = async () => {
    while (next < groups.length) {
      const i = next++;
      try {
        outcomes[i] = await buyOne(db, eventId, groups[i], i);
      } catch (error) {
        console.error(`Đơn ${i} (${groups[i].length} ghế) lỗi:`, error);
      }
      onProgress?.(++done);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  const okGroups = groups.filter((_, i) => outcomes[i]);
  return {
    orders: okGroups.length,
    seats: okGroups.reduce((sum, g) => sum + g.length, 0),
    failed: groups.length - okGroups.length,
  };
}
