"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getPoolDb, getDb } from "@/db/client";
import {
  advanceEventStatus,
  createEvent,
  fetchGeometry,
  rebindEventVersion,
  setTrending,
} from "../commands/events";
import { formObject, unwrap, assertUuid } from "./form";

function invalidateEvent(id: string) {
  updateTag("events");
  updateTag(`event:${id}`);
}

export async function createEventAction(formData: FormData) {
  const created = unwrap(
    await createEvent(getPoolDb(), fetchGeometry, formObject(formData)),
  );
  updateTag("events");
  redirect(`/admin/events/${created.id}`);
}

export async function advanceStatusAction(eventId: string) {
  assertUuid(eventId);
  unwrap(await advanceEventStatus(getDb(), eventId));
  invalidateEvent(eventId);
  redirect(`/admin/events/${eventId}`);
}

export async function setTrendingAction(eventId: string, trending: boolean) {
  assertUuid(eventId);
  await setTrending(getDb(), eventId, trending);
  invalidateEvent(eventId);
  redirect(`/admin/events/${eventId}`);
}

/** Re-snapshots seats from another template version (transaction → pool db). */
export async function rebindVersionAction(eventId: string, formData: FormData) {
  assertUuid(eventId);
  const { templateVersionId } = formObject(formData);
  unwrap(
    await rebindEventVersion(
      getPoolDb(),
      fetchGeometry,
      eventId,
      templateVersionId,
    ),
  );
  invalidateEvent(eventId);
  redirect(`/admin/events/${eventId}`);
}
