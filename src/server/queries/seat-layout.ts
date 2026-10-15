import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { getSeatLayout, type SeatLayout } from "../inventory/layout";

/**
 * Bố cục tier của ghế, tag `event:<id>` (admin đổi tier/giá gọi updateTag). Lưu ý: trên Vercel,
 * handler mặc định của "use cache" là bộ nhớ riêng từng instance — không chia sẻ, dễ miss;
 * lớp chắn egress chính là CDN `s-maxage` của route /api/events/[id]/layout.
 */
export async function getCachedSeatLayout(
  eventId: string,
): Promise<SeatLayout> {
  "use cache";
  cacheLife("hours");
  cacheTag(`event:${eventId}`);
  return getSeatLayout(getDb(), eventId);
}
