import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  eventSeats,
  events,
  priceTiers,
  templateVersions,
  templates,
} from "@/db/schema";
import { snapshotSeats } from "@/domain/seats/snapshot";
import { venueSchema, type Venue } from "@/domain/venue/types";
import type { Db } from "../inventory/db";
import { localBlobUrlSchema } from "./image-url";
import { isLocalBlobUrl, readLocalBlob } from "../local-blob";
import {
  assignTier,
  seatIdsBySections,
  seatIdsBySids,
  setBlocked,
  snapshotEventSeats,
} from "../inventory/seats";
import { invalid, type CommandResult } from "./venues";

export type LoadGeometry = (url: string) => Promise<Venue>;

export const fetchGeometry: LoadGeometry = async (url) => {
  if (isLocalBlobUrl(url))
    return venueSchema.parse(JSON.parse(await readLocalBlob(url)));
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Cannot load geometry (${res.status})`);
  return venueSchema.parse(await res.json());
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const IMAGE_HOSTS = ["picsum.photos", "fastly.picsum.photos"];

/** https from our Blob store / picsum, or a local-blob path (local mode). */
const remoteImageSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  const { hostname } = new URL(value);
  return (
    hostname.endsWith(".public.blob.vercel-storage.com") ||
    IMAGE_HOSTS.includes(hostname)
  );
}, "image must be hosted on Vercel Blob");
const imageUrlSchema = z.union([remoteImageSchema, localBlobUrlSchema]);

export const eventInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .regex(slugRe, "lowercase letters, digits and dashes only"),
  category: z.enum(["sports", "music", "shows"]),
  startsAt: z.coerce.date(),
  templateVersionId: z.uuid(),
  imageUrl: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(imageUrlSchema.nullable())
    .nullish(),
});

/** Creates the event and snapshots its seats in one transaction (needs a transaction-capable db). */
export async function createEvent(
  db: Db,
  loadGeometry: LoadGeometry,
  input: unknown,
): Promise<CommandResult<{ id: string; slug: string; seatCount: number }>> {
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [version] = await db
    .select({
      geometryUrl: templateVersions.geometryUrl,
      venueId: templates.venueId,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, parsed.data.templateVersionId));
  if (!version) return { ok: false, error: "Template version not found" };

  const seats = snapshotSeats(await loadGeometry(version.geometryUrl));
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        ...parsed.data,
        imageUrl: parsed.data.imageUrl ?? null,
        venueId: version.venueId,
      })
      .returning({ id: events.id, slug: events.slug });
    const seatCount = await snapshotEventSeats(tx, event.id, seats);
    return { ok: true as const, value: { ...event, seatCount } };
  });
}

const STATUS_NEXT = { draft: "on_sale", on_sale: "ended" } as const;

export async function advanceEventStatus(
  db: Db,
  eventId: string,
): Promise<CommandResult<string>> {
  const [event] = await db
    .select({ status: events.status })
    .from(events)
    .where(eq(events.id, eventId));
  if (!event) return { ok: false, error: "Event not found" };
  if (event.status === "ended")
    return { ok: false, error: "Event already ended" };
  const next = STATUS_NEXT[event.status];
  await db.update(events).set({ status: next }).where(eq(events.id, eventId));
  return { ok: true, value: next };
}

export async function setTrending(db: Db, eventId: string, trending: boolean) {
  await db
    .update(events)
    .set({ isTrending: trending })
    .where(eq(events.id, eventId));
}

const tierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.coerce.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb"),
});

export async function createTier(
  db: Db,
  eventId: string,
  input: unknown,
): Promise<CommandResult<string>> {
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [row] = await db
    .insert(priceTiers)
    .values({ ...parsed.data, eventId })
    .returning({ id: priceTiers.id });
  return { ok: true, value: row.id };
}

export async function updateTier(
  db: Db,
  eventId: string,
  tierId: string,
  input: unknown,
): Promise<CommandResult<string>> {
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await db
    .update(priceTiers)
    .set(parsed.data)
    .where(and(eq(priceTiers.id, tierId), eq(priceTiers.eventId, eventId)));
  return { ok: true, value: tierId };
}

export async function deleteTier(
  db: Db,
  eventId: string,
  tierId: string,
): Promise<CommandResult<null>> {
  const [inUse] = await db
    .select({ id: eventSeats.id })
    .from(eventSeats)
    .where(
      and(
        eq(eventSeats.eventId, eventId),
        eq(eventSeats.tierId, tierId),
        inArray(eventSeats.status, ["held", "sold"]),
      ),
    )
    .limit(1);
  if (inUse) return { ok: false, error: "Tier is used by held or sold seats" };
  await db
    .delete(priceTiers)
    .where(and(eq(priceTiers.id, tierId), eq(priceTiers.eventId, eventId)));
  return { ok: true, value: null };
}

/** Form fallback for SeatAssignMap: free-text section list ("A1, A2 B3"). */
export const parseSectionList = (text: string): string[] => [
  ...new Set(text.split(/[\s,;]+/).filter(Boolean)),
];

export async function assignTierToSections(
  db: Db,
  eventId: string,
  sections: readonly string[],
  tierId: string | null,
): Promise<number> {
  if (tierId) {
    const [tier] = await db
      .select({ id: priceTiers.id })
      .from(priceTiers)
      .where(and(eq(priceTiers.id, tierId), eq(priceTiers.eventId, eventId)));
    if (!tier) return 0;
  }
  return assignTier(
    db,
    eventId,
    await seatIdsBySections(db, eventId, sections),
    tierId,
  );
}

export async function blockSections(
  db: Db,
  eventId: string,
  sections: readonly string[],
  blocked: boolean,
): Promise<number> {
  return setBlocked(
    db,
    eventId,
    await seatIdsBySections(db, eventId, sections),
    blocked,
  );
}

/** `ignored` counts malformed sids that were skipped. */
export type SeatChange = { changed: number; ignored: number };

const MAX_SIDS = 20_000;
const sidsSchema = z.array(z.string().min(1).max(64)).min(1).max(MAX_SIDS);

/** Map-based assignment. tierId null clears the tier. Only available/blocked seats change. */
export async function assignTierToSeats(
  db: Db,
  eventId: string,
  sids: unknown,
  tierId: string | null,
): Promise<CommandResult<SeatChange>> {
  const parsed = sidsSchema.safeParse(sids);
  if (!parsed.success) return invalid(parsed.error);
  if (tierId) {
    const [tier] = await db
      .select({ id: priceTiers.id })
      .from(priceTiers)
      .where(and(eq(priceTiers.id, tierId), eq(priceTiers.eventId, eventId)));
    if (!tier) return { ok: false, error: "Tier not found" };
  }
  const { ids, malformed } = await seatIdsBySids(db, eventId, parsed.data);
  return {
    ok: true,
    value: {
      changed: await assignTier(db, eventId, ids, tierId),
      ignored: malformed,
    },
  };
}

export async function blockSeats(
  db: Db,
  eventId: string,
  sids: unknown,
  blocked: boolean,
): Promise<CommandResult<SeatChange>> {
  const parsed = sidsSchema.safeParse(sids);
  if (!parsed.success) return invalid(parsed.error);
  const { ids, malformed } = await seatIdsBySids(db, eventId, parsed.data);
  return {
    ok: true,
    value: {
      changed: await setBlocked(db, eventId, ids, blocked),
      ignored: malformed,
    },
  };
}
