import { describe, expect, it } from "vitest";
import { pageCount, pageItems, stepPage } from "./carousel";
import {
  dayRange,
  formatEventDate,
  formatEventLine,
  upcomingWeekendRange,
} from "./dates";
import {
  parseFavorites,
  saveToggledFavorite,
  toggleFavorite,
} from "./favorites";
import { isOptimizableImage } from "./image-url";
import {
  addRecentlyViewed,
  parseRecentlyViewed,
  recordRecentlyViewed,
  RECENTLY_VIEWED_KEY,
  type ViewedEvent,
} from "./recently-viewed";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const ev = (slug: string): ViewedEvent => ({
  slug,
  name: slug,
  startsAt: "2026-10-15T12:00:00.000Z",
  venueName: "V",
  imageUrl: null,
});

describe("dates", () => {
  it("formats in the Vietnam zone", () => {
    // 18:00Z is already the next calendar day at UTC+7.
    expect(formatEventDate("2026-10-15T18:00:00Z")).toBe("Oct 16");
    expect(formatEventLine("2026-10-15T05:00:00Z", "Rosetta")).toBe(
      "Oct 15 · Rosetta",
    );
  });

  it("builds a one-day range and rejects bad input", () => {
    expect(dayRange("2026-10-15")).toEqual({
      from: "2026-10-14T17:00:00.000Z",
      to: "2026-10-15T17:00:00.000Z",
    });
    expect(dayRange("15/10/2026")).toBeUndefined();
    expect(dayRange("2026-13-45")).toBeUndefined();
    expect(dayRange(undefined)).toBeUndefined();
  });

  it("finds the weekend from any weekday", () => {
    const friday = "2026-10-08T17:00:00.000Z"; // Fri 00:00 +07
    const expected = { from: friday, to: "2026-10-11T17:00:00.000Z" };
    // Thu 2026-10-01 .. Sat/Sun of the same week all resolve correctly.
    expect(upcomingWeekendRange(new Date("2026-10-05T03:00:00Z"))).toEqual(
      expected,
    ); // Mon
    expect(upcomingWeekendRange(new Date("2026-10-08T20:00:00Z"))).toEqual(
      expected,
    ); // Fri 03:00 +07
    expect(upcomingWeekendRange(new Date("2026-10-09T10:00:00Z"))).toEqual(
      expected,
    ); // Sat
    expect(upcomingWeekendRange(new Date("2026-10-10T10:00:00Z"))).toEqual(
      expected,
    ); // Sun
  });
});

describe("carousel", () => {
  it("counts pages with a minimum of one", () => {
    expect(pageCount(0, 4)).toBe(1);
    expect(pageCount(4, 4)).toBe(1);
    expect(pageCount(5, 4)).toBe(2);
  });

  it("wraps when stepping", () => {
    expect(stepPage(0, -1, 3)).toBe(2);
    expect(stepPage(2, 1, 3)).toBe(0);
    expect(stepPage(0, 1, 1)).toBe(0);
  });

  it("slices a page", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(pageItems(items, 1, 4)).toEqual([5, 6]);
  });
});

describe("recently viewed", () => {
  it("puts newest first without duplicates and caps the list", () => {
    const list = addRecentlyViewed([ev("a"), ev("b")], ev("b"));
    expect(list.map((e) => e.slug)).toEqual(["b", "a"]);
    expect(addRecentlyViewed(list, ev("c"), 2).map((e) => e.slug)).toEqual([
      "c",
      "b",
    ]);
  });

  it("tolerates corrupt storage", () => {
    expect(parseRecentlyViewed("")).toEqual([]);
    expect(parseRecentlyViewed("{nope")).toEqual([]);
    expect(parseRecentlyViewed('[{"slug":1}]')).toEqual([]);
  });

  it("records through storage", () => {
    const storage = memoryStorage();
    recordRecentlyViewed(ev("a"), storage);
    recordRecentlyViewed(ev("b"), storage);
    const saved = parseRecentlyViewed(storage.data.get(RECENTLY_VIEWED_KEY)!);
    expect(saved.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("does not throw when storage fails", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => recordRecentlyViewed(ev("a"), broken)).not.toThrow();
  });
});

describe("favorites", () => {
  it("toggles immutably", () => {
    const base = ["a"];
    expect(toggleFavorite(base, "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(base, "a")).toEqual([]);
    expect(base).toEqual(["a"]);
  });

  it("persists and parses defensively", () => {
    const storage = memoryStorage();
    saveToggledFavorite("x", storage);
    expect(parseFavorites(storage.data.get("seatmap:favorites")!)).toEqual([
      "x",
    ]);
    expect(parseFavorites('{"a":1}')).toEqual([]);
    expect(parseFavorites('["a",2]')).toEqual(["a"]);
  });
});

describe("isOptimizableImage", () => {
  it("accepts local paths and Blob hosts only", () => {
    expect(isOptimizableImage("/img/a.png")).toBe(true);
    expect(
      isOptimizableImage("https://abc123.public.blob.vercel-storage.com/a.png"),
    ).toBe(true);
    expect(isOptimizableImage("https://picsum.photos/seed/x/1200/675")).toBe(
      true,
    );
    expect(isOptimizableImage("//evil.com/a.png")).toBe(false);
    expect(isOptimizableImage("https://example.com/a.png")).toBe(false);
    expect(isOptimizableImage("not a url")).toBe(false);
  });
});
