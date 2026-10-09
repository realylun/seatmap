"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  FAVORITES_KEY,
  parseFavorites,
  saveToggledFavorite,
} from "@/features/home/favorites";
import { readItem, subscribeToStorage } from "@/features/home/storage";

const readRaw = () => readItem(FAVORITES_KEY);
const readServer = () => "";

export function HeartButton({ slug, name }: { slug: string; name: string }) {
  const raw = useSyncExternalStore(subscribeToStorage, readRaw, readServer);
  const saved = useMemo(() => parseFavorites(raw).includes(slug), [raw, slug]);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from favorites` : `Save ${name}`}
      onClick={() => saveToggledFavorite(slug)}
      className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:scale-110 hover:bg-black/45"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill={saved ? "var(--accent)" : "none"}
        stroke={saved ? "var(--accent)" : "currentColor"}
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.7 3.7 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.3 0 5.4 3.2 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
      </svg>
    </button>
  );
}
