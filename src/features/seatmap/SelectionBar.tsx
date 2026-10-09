"use client";

import { formatVnd } from "@/domain/pricing/money";
import { decodeSid } from "@/domain/seats/seat-id";
import { MAX_SELECTION } from "./selection";

type Props = {
  selection: readonly string[];
  total: number;
  pending: boolean;
  error: string | null;
  onClear: () => void;
  onHold: () => void;
};

function seatLabel(sid: string): string {
  const { section, row, seat } = decodeSid(sid);
  return `Sec ${section} · Row ${row} · Seat ${seat}`;
}

export function SelectionBar(props: Props) {
  const count = props.selection.length;
  if (count === 0 && !props.error) return null;
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-5">
      {props.error && (
        <p
          role="alert"
          data-testid="hold-error"
          className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {props.error}
        </p>
      )}
      {count > 0 && (
        <div data-testid="selected-seats-bar">
          <ul className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted">
            {props.selection.map((sid) => (
              <li key={sid} className="rounded bg-gray-100 px-2 py-0.5">
                {seatLabel(sid)}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <p className="flex-1" aria-live="polite">
              <span className="font-bold" data-testid="selected-count">
                {count} {count === 1 ? "seat" : "seats"}
              </span>
              <span className="text-muted"> · {formatVnd(props.total)}</span>
              {count >= MAX_SELECTION && (
                <span className="block text-xs text-muted">
                  Maximum {MAX_SELECTION} seats per order
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={props.onClear}
              className="text-sm font-semibold text-muted hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button"
              data-testid="hold-button"
              onClick={props.onHold}
              disabled={props.pending}
              className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {props.pending ? "Holding…" : "Hold seats"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
