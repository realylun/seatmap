import { Suspense } from "react";
import { DEFAULT_FPS_WINDOW_DAYS, listFpsSummary } from "@/server/queries/fps";
import { Loading, PageHeader, Table, Td } from "../_components/ui";

const fmt = (n: number, digits = 1) => n.toFixed(digits);

async function FpsTable() {
  const rows = await listFpsSummary();
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No FPS telemetry in the last {DEFAULT_FPS_WINDOW_DAYS} days.
      </p>
    );
  }
  return (
    <Table
      head={[
        "Event",
        "Device",
        "Sessions",
        "Median FPS",
        "p95 frame (ms)",
        "Sessions < 30 fps",
      ]}
    >
      {rows.map((r) => (
        <tr key={`${r.eventId}:${r.deviceClass}`}>
          <Td>{r.eventName}</Td>
          <Td>{r.deviceClass}</Td>
          <Td>{r.sessions}</Td>
          <Td>{fmt(r.medianFps)}</Td>
          <Td>{fmt(r.p95FrameMs)}</Td>
          <Td>{fmt(r.slowPct)}%</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function PerformancePage() {
  return (
    <>
      <PageHeader title="Seat map performance" />
      <p className="mb-4 text-sm text-zinc-500">
        Frames measured while the map is moving, last {DEFAULT_FPS_WINDOW_DAYS}{" "}
        days.
      </p>
      <Suspense fallback={<Loading />}>
        <FpsTable />
      </Suspense>
    </>
  );
}
