"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useAvailability } from "@/features/seatmap/use-availability";
import {
  assignTierToSeatsAction,
  blockSeatsAction,
} from "@/server/actions/tiers";
import {
  applyPick,
  indexSeats,
  targetSids,
  type Pick,
} from "./assign-selection";

const SeatAssignMap = dynamic(() => import("./SeatAssignMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-zinc-500">Loading seat map…</p>,
});

const btn =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

type Props = {
  eventId: string;
  geometryUrl: string;
  tiers: readonly { id: string; name: string; price: number; color: string }[];
};

const NO_SELECTION: ReadonlySet<string> = new Set();

export function SeatAssignPanel({ eventId, geometryUrl, tiers }: Props) {
  const router = useRouter();
  const { data, error, refresh } = useAvailability(eventId);
  const [selection, setSelection] = useState(NO_SELECTION);
  const [tierId, setTierId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const index = useMemo(
    () => indexSeats(data?.seats.map((s) => s.sid) ?? []),
    [data],
  );

  const onPick = (pick: Pick, additive: boolean) => {
    setSelection((current) =>
      applyPick(current, targetSids(index, pick), additive),
    );
  };

  /** `tiersChanged`: gán tier → tải lại cả layout (bỏ qua CDN); chặn/bỏ chặn chỉ đổi status */
  const run = (
    tiersChanged: boolean,
    action: () => Promise<
      | { ok: true; value: { changed: number; ignored: number } }
      | { ok: false; error: string }
    >,
  ) => {
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? `${result.value.changed} seats updated${result.value.ignored ? `, ${result.value.ignored} invalid ids ignored` : ""}`
          : result.error,
      );
      await refresh(true, tiersChanged);
      router.refresh();
    });
  };

  const sids = [...selection];
  const empty = sids.length === 0;

  return (
    <div className="grid grid-cols-[1fr_16rem] gap-4">
      <div className="h-[600px] overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <SeatAssignMap
          geometryUrl={geometryUrl}
          availability={data}
          index={index}
          selection={selection}
          onPick={onPick}
        />
      </div>
      <aside className="flex flex-col gap-3 text-sm">
        <p>
          <b data-testid="assign-selected-count">{selection.size}</b> seats
          selected
        </p>
        <p className="text-xs text-zinc-500">
          Zoom out: click a section. Zoom in: click a row, then a seat.
          Shift-click adds or removes.
        </p>
        <select
          aria-label="Tier"
          value={tierId}
          onChange={(e) => setTierId(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">(no tier)</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className={btn}
          disabled={empty || pending}
          onClick={() =>
            run(true, () =>
              assignTierToSeatsAction(eventId, sids, tierId || null),
            )
          }
        >
          Assign tier
        </button>
        <button
          className={btn}
          disabled={empty || pending}
          onClick={() =>
            run(false, () => blockSeatsAction(eventId, sids, true))
          }
        >
          Block
        </button>
        <button
          className={btn}
          disabled={empty || pending}
          onClick={() =>
            run(false, () => blockSeatsAction(eventId, sids, false))
          }
        >
          Unblock
        </button>
        <button
          className={btn}
          disabled={empty}
          onClick={() => setSelection(NO_SELECTION)}
        >
          Clear
        </button>
        {message && <output>{message}</output>}
        {error && <p className="text-red-600">{error}</p>}
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {tiers.map((t) => (
            <Legend key={t.id} color={t.color} label={t.name} />
          ))}
          <Legend color="#f59e0b" label="Held" />
          <Legend color="#475569" label="Sold" />
          <Legend color="#9ca3af" label="Blocked" ring="#b91c1c" />
        </ul>
      </aside>
    </div>
  );
}

function Legend({
  color,
  label,
  ring,
}: {
  color: string;
  label: string;
  ring?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{
          background: color,
          outline: ring ? `2px solid ${ring}` : undefined,
        }}
      />
      {label}
    </li>
  );
}
