"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, getPoolDb } from "@/db/client";
import { ensureSessionId, readSessionId } from "@/lib/session";
import { createHold, MAX_HOLD_SEATS, releaseHold } from "../inventory/holds";
import {
  getEventSaleInfo,
  getHoldSummary,
  resolveSeatIds,
} from "../queries/event-detail";

export type HoldActionResult = {
  ok: false;
  reason:
    | "INVALID_INPUT"
    | "NOT_ON_SALE"
    | "SEATS_TAKEN"
    | "RATE_LIMITED"
    | "ERROR";
  message: string;
  takenSids: string[];
};

const holdInputSchema = z.object({
  eventId: z.uuid(),
  sids: z
    .array(
      z
        .string()
        .max(64)
        .regex(/^[^|]+\|[^|]+\|[^|]+$/),
    )
    .min(1)
    .max(MAX_HOLD_SEATS),
});

/** IP client (đầu chuỗi x-forwarded-for, fallback x-real-ip) cho rate limit giữ ghế */
async function readClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  return ip ? ip.slice(0, 64) : null;
}

const fail = (
  reason: HoldActionResult["reason"],
  message: string,
  takenSids: string[] = [],
): HoldActionResult => ({ ok: false, reason, message, takenSids });

async function holdSeats(
  eventId: string,
  sids: readonly string[],
): Promise<HoldActionResult | { ok: true; holdId: string }> {
  const event = await getEventSaleInfo(eventId);
  if (event?.status !== "on_sale") {
    return fail("NOT_ON_SALE", "Tickets for this event are not on sale.");
  }
  const idBySid = await resolveSeatIds(eventId, sids);
  const missing = sids.filter((sid) => !idBySid.has(sid));
  if (missing.length > 0) {
    return fail("SEATS_TAKEN", "Some seats no longer exist.", missing);
  }
  const [sessionId, clientIp] = await Promise.all([
    ensureSessionId(),
    readClientIp(),
  ]);
  // createHold chạy trong transaction (release hold cũ + claim ghế) → cần pool driver
  const result = await createHold(getPoolDb(), {
    eventId,
    seatIds: [...idBySid.values()],
    sessionId,
    clientIp: clientIp ?? undefined,
  });
  if (result.ok) return { ok: true, holdId: result.holdId };
  if (result.reason === "SEATS_TAKEN") {
    const taken = new Set(result.takenSeatIds);
    return fail(
      "SEATS_TAKEN",
      "Some seats were just taken by someone else. Please pick again.",
      sids.filter((sid) => taken.has(idBySid.get(sid) ?? -1)),
    );
  }
  if (result.reason === "RATE_LIMITED") {
    return fail(
      "RATE_LIMITED",
      "Too many hold attempts. Please wait a minute and try again.",
    );
  }
  return fail("INVALID_INPUT", "Select between 1 and 8 seats.");
}

/** Giữ ghế cho session hiện tại → redirect tới checkout; lỗi nghiệp vụ trả về cho client. */
export async function createHoldAction(
  eventId: string,
  sids: string[],
): Promise<HoldActionResult> {
  const parsed = holdInputSchema.safeParse({ eventId, sids });
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Select between 1 and 8 seats.");
  }
  let holdId: string;
  try {
    const result = await holdSeats(parsed.data.eventId, parsed.data.sids);
    if (!result.ok) return result;
    holdId = result.holdId;
  } catch (error) {
    console.error("createHoldAction failed", { eventId, error });
    return fail("ERROR", "Could not hold seats. Please try again.");
  }
  redirect(`/checkout/${holdId}`);
}

/** Huỷ giữ ghế (chỉ chủ hold) rồi quay lại trang event */
export async function releaseHoldAction(holdId: string) {
  if (!z.uuid().safeParse(holdId).success) redirect("/");
  const [sessionId, hold] = await Promise.all([
    readSessionId(),
    getHoldSummary(holdId),
  ]);
  if (sessionId && hold) await releaseHold(getDb(), holdId, sessionId);
  redirect(hold ? `/events/${hold.eventSlug}` : "/");
}
