import {
  readItem,
  writeItem,
  type KeyValueStorage,
} from "@/features/home/storage";

export const FAVORITES_KEY = "seatmap:favorites";

export function parseFavorites(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(
  list: readonly string[],
  slug: string,
): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

export function saveToggledFavorite(
  slug: string,
  storage?: KeyValueStorage,
): void {
  const current = parseFavorites(readItem(FAVORITES_KEY, storage));
  writeItem(
    FAVORITES_KEY,
    JSON.stringify(toggleFavorite(current, slug)),
    storage,
  );
}
