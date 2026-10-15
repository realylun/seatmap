import { sql } from "drizzle-orm";
import { eventSeats } from "@/db/schema";
import { decodeSid } from "@/domain/seats/seat-id";

/** sid ghép trong SQL: "section|row|seat" — cùng định dạng encodeSid */
export const sidSql = sql<string>`${eventSeats.section} || '|' || ${eventSeats.row} || '|' || ${eventSeats.seat}`;

/** json_agg(sid) → string[]; json được mọi driver (Neon/pg/PGlite) parse sẵn */
export const sidsAggSql = sql<
  string[]
>`json_agg(${sidSql} order by ${eventSeats.id})`;

/**
 * Chuẩn hoá sid ghép trong SQL qua decodeSid: phần rỗng hoặc chứa "|" làm số phần ≠ 3 → throw,
 * tương đương validate của encodeSid trên từng cột.
 */
export function checkedSids(sids: readonly string[]): string[] {
  return sids.map((sid) => {
    decodeSid(sid);
    return sid;
  });
}
