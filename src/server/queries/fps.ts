import { connection } from "next/server";
import { asc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events, fpsSamples } from "@/db/schema";
import type { Db } from "../inventory/db";

export const DEFAULT_FPS_WINDOW_DAYS = 7;
/** Phiên có FPS trung bình dưới mức này tính là "chậm" */
const SLOW_FPS = 30;

export type FpsSummaryRow = {
  eventId: string;
  eventName: string;
  deviceClass: string;
  sessions: number;
  medianFps: number;
  p95FrameMs: number;
  slowPct: number;
};

/** Tổng hợp telemetry FPS theo event × loại thiết bị trong `sinceDays` ngày gần nhất */
export function fpsSummaryByEvent(
  db: Db,
  { sinceDays = DEFAULT_FPS_WINDOW_DAYS }: { sinceDays?: number } = {},
): Promise<FpsSummaryRow[]> {
  return db
    .select({
      eventId: fpsSamples.eventId,
      eventName: events.name,
      deviceClass: fpsSamples.deviceClass,
      sessions: sql<number>`count(*)::int`,
      medianFps: sql<number>`(percentile_cont(0.5) within group (order by ${fpsSamples.avgFps}))::float8`,
      p95FrameMs: sql<number>`(percentile_cont(0.95) within group (order by ${fpsSamples.p95FrameMs}))::float8`,
      slowPct: sql<number>`round(100.0 * count(*) filter (where ${fpsSamples.avgFps} < ${SLOW_FPS}) / count(*), 1)::float8`,
    })
    .from(fpsSamples)
    .innerJoin(events, eq(events.id, fpsSamples.eventId))
    .where(
      gte(
        fpsSamples.createdAt,
        sql`now() - make_interval(days => ${sinceDays})`,
      ),
    )
    .groupBy(fpsSamples.eventId, events.name, fpsSamples.deviceClass)
    .orderBy(asc(events.name), asc(fpsSamples.deviceClass));
}

/** Cho trang admin: request-time (không prerender) với DB của app */
export async function listFpsSummary(): Promise<FpsSummaryRow[]> {
  await connection();
  return fpsSummaryByEvent(getDb());
}
