import { formatVnd } from "@/domain/pricing/money";

export type SeatLineItem = {
  section: string;
  row: string;
  seat: string;
  price: number;
  tierName?: string;
};

const natural = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true });

const compareSeats = (a: SeatLineItem, b: SeatLineItem) =>
  natural(a.section, b.section) ||
  natural(a.row, b.row) ||
  natural(a.seat, b.seat);

/** Bảng ghế + tổng tiền dùng chung cho checkout và trang xác nhận đơn */
export function SeatLines({
  seats,
  total,
}: {
  seats: readonly SeatLineItem[];
  total: number;
}) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {seats.toSorted(compareSeats).map((s) => (
          <li
            key={`${s.section}|${s.row}|${s.seat}`}
            className="flex items-center justify-between py-2.5"
          >
            <span>
              Section {s.section} · Row {s.row} · Seat {s.seat}
              {s.tierName && (
                <span className="block text-xs text-muted">{s.tierName}</span>
              )}
            </span>
            <span className="font-semibold">{formatVnd(s.price)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold">
        <span>Total</span>
        <span>{formatVnd(total)}</span>
      </p>
    </div>
  );
}
