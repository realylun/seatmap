/** Minimal Storage surface so helpers can be tested without a DOM. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

const CHANGE_EVENT = "seatmap:storage";

export function readItem(key: string, storage?: KeyValueStorage): string {
  try {
    const target = storage ?? globalThis.localStorage;
    return target.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeItem(
  key: string,
  value: string,
  storage?: KeyValueStorage,
): void {
  try {
    const target = storage ?? globalThis.localStorage;
    target.setItem(key, value);
  } catch {
    // Private mode or quota exceeded: personalisation is best-effort.
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Subscribe to writes from this tab and from other tabs. */
export function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
