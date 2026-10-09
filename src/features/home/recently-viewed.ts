import { z } from "zod";
import {
  readItem,
  writeItem,
  type KeyValueStorage,
} from "@/features/home/storage";

export const RECENTLY_VIEWED_KEY = "seatmap:recently-viewed";
export const RECENTLY_VIEWED_MAX = 12;

const viewedEventSchema = z.object({
  slug: z.string().min(1),
  name: z.string(),
  startsAt: z.string(),
  venueName: z.string(),
  imageUrl: z.string().nullable(),
});

export type ViewedEvent = z.infer<typeof viewedEventSchema>;

export function parseRecentlyViewed(raw: string): ViewedEvent[] {
  if (!raw) return [];
  try {
    const parsed = z.array(viewedEventSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Newest first, de-duplicated by slug, capped at `max`. */
export function addRecentlyViewed(
  list: readonly ViewedEvent[],
  event: ViewedEvent,
  max = RECENTLY_VIEWED_MAX,
): ViewedEvent[] {
  return [event, ...list.filter((e) => e.slug !== event.slug)].slice(0, max);
}

/** Call from the event detail page (client) when it is viewed. */
export function recordRecentlyViewed(
  event: ViewedEvent,
  storage?: KeyValueStorage,
): void {
  const current = parseRecentlyViewed(readItem(RECENTLY_VIEWED_KEY, storage));
  const next = addRecentlyViewed(current, event);
  writeItem(RECENTLY_VIEWED_KEY, JSON.stringify(next), storage);
}
