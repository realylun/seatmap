import type { SeatCounts } from "./availability";

const format = (n: number) => n.toLocaleString("vi-VN");

type Line = {
  readonly label: string;
  readonly value: number;
  readonly dot: string;
};

/** Sức chứa + số ghế theo trạng thái, đặt dưới nút 3D / Full view (cập nhật theo poll availability) */
export function SeatCountBadge({ counts }: { counts: SeatCounts }) {
  const lines: readonly Line[] = [
    { label: "Available", value: counts.available, dot: "bg-emerald-500" },
    { label: "Held", value: counts.held, dot: "bg-amber-400" },
    { label: "Sold", value: counts.sold, dot: "bg-gray-400" },
    ...(counts.blocked > 0
      ? [{ label: "Blocked", value: counts.blocked, dot: "bg-gray-700" }]
      : []),
  ];
  return (
    <div
      data-testid="seat-count"
      aria-label="Seat capacity"
      className="min-w-36 rounded-md border border-line bg-white/95 px-2.5 py-1.5 text-xs shadow-sm"
    >
      <p className="flex justify-between gap-3 font-semibold">
        <span>Seats</span>
        <span className="tabular-nums">{format(counts.total)}</span>
      </p>
      <dl className="mt-1 space-y-0.5 text-muted">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between gap-3"
          >
            <dt className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-full ${line.dot}`} />
              {line.label}
            </dt>
            <dd className="text-ink tabular-nums">{format(line.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
