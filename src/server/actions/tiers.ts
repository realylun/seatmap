"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  assignTierToSeats,
  assignTierToSections,
  blockSeats,
  blockSections,
  createTier,
  deleteTier,
  parseSectionList,
  type SeatChange,
  updateTier,
} from "../commands/events";
import type { CommandResult } from "../commands/venues";
import { assertUuid, formObject, isUuid, unwrap } from "./form";

function done(eventId: string): never {
  updateTag("events");
  updateTag(`event:${eventId}`);
  redirect(`/admin/events/${eventId}`);
}

export async function createTierAction(eventId: string, formData: FormData) {
  assertUuid(eventId);
  unwrap(await createTier(getDb(), eventId, formObject(formData)));
  done(eventId);
}

export async function updateTierAction(
  eventId: string,
  tierId: string,
  formData: FormData,
) {
  assertUuid(eventId, tierId);
  unwrap(await updateTier(getDb(), eventId, tierId, formObject(formData)));
  done(eventId);
}

export async function deleteTierAction(eventId: string, tierId: string) {
  assertUuid(eventId, tierId);
  unwrap(await deleteTier(getDb(), eventId, tierId));
  done(eventId);
}

/** Form fallback: tierId "" clears the tier. */
export async function assignSectionsAction(
  eventId: string,
  formData: FormData,
) {
  assertUuid(eventId);
  const { sections = "", tierId = "" } = formObject(formData);
  await assignTierToSections(
    getDb(),
    eventId,
    parseSectionList(sections),
    tierId || null,
  );
  done(eventId);
}

export async function blockSectionsAction(
  eventId: string,
  blocked: boolean,
  formData: FormData,
) {
  assertUuid(eventId);
  const { sections = "" } = formObject(formData);
  await blockSections(getDb(), eventId, parseSectionList(sections), blocked);
  done(eventId);
}

function invalidate(eventId: string) {
  updateTag("events");
  updateTag(`event:${eventId}`);
}

async function guarded(
  eventId: string,
  run: () => Promise<CommandResult<SeatChange>>,
) {
  if (!isUuid(eventId)) return { ok: false, error: "Invalid id" } as const;
  try {
    const result = await run();
    if (result.ok) invalidate(eventId);
    return result;
  } catch (cause) {
    console.error("seat update failed", cause);
    return {
      ok: false,
      error: "Could not update seats",
    } satisfies CommandResult<SeatChange>;
  }
}

/** Map-based: sids are "section|row|seat"; returns the number of seats changed. */
export async function assignTierToSeatsAction(
  eventId: string,
  sids: string[],
  tierId: string | null,
): Promise<CommandResult<SeatChange>> {
  if (tierId !== null && !isUuid(tierId))
    return { ok: false, error: "Invalid id" };
  return guarded(eventId, () =>
    assignTierToSeats(getDb(), eventId, sids, tierId),
  );
}

export async function blockSeatsAction(
  eventId: string,
  sids: string[],
  blocked: boolean,
): Promise<CommandResult<SeatChange>> {
  return guarded(eventId, () => blockSeats(getDb(), eventId, sids, blocked));
}
