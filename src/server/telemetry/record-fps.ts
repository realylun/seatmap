import { and, eq, gte, sql } from "drizzle-orm";
import { events, fpsSamples } from "@/db/schema";
import type { Db } from "../inventory/db";
import type { FpsSampleInput } from "./fps-schema";

export type RecordFpsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "event_not_found" };

/**
 * Upsert 1 dòng / phiên: client gửi lại nhiều lần (định kỳ, khi ẩn tab, khi rời trang) với số liệu
 * cộng dồn → giữ bản đầy đủ nhất. Không cho đổi event của một session đã có.
 */
export async function recordFpsSample(
  db: Db,
  input: FpsSampleInput & { readonly userAgent: string },
): Promise<RecordFpsResult> {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, input.eventId));
  if (!event) return { ok: false, reason: "event_not_found" };

  const { sessionId: _sessionId, eventId: _eventId, ...metrics } = input;
  await db
    .insert(fpsSamples)
    .values(input)
    .onConflictDoUpdate({
      target: fpsSamples.sessionId,
      set: { ...metrics, updatedAt: sql`now()` },
      // Beacon (payload cũ) và fetch của worker (payload mới) có thể tới sai thứ tự: số frame
      // chỉ tăng trong một phiên nên chỉ nhận bản có nhiều frame hơn hoặc bằng
      setWhere: and(
        eq(fpsSamples.eventId, input.eventId),
        gte(sql`excluded.frames`, fpsSamples.frames),
      ),
    });
  return { ok: true };
}
