import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { serializeGeometry } from "@/domain/venue/geometry-json";
import { splitVenue } from "@/domain/venue/split";
import type { SectionConfig } from "@/domain/venue/types";
import { buildVenue } from "@/domain/venue/venue-file";
import { parseOverview } from "./map-venue";
import { createSeatLoader } from "./seat-loader";

const OVERVIEW_URL = "https://blob.test/geometry/t/v1-abcdefgh/overview.json";

const section = (id: string, x: number): SectionConfig => ({
  id,
  ring: [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
    [x, 1],
    [x, 0],
  ],
  frontEdge: 0,
  rowStart: "A",
  rowCount: 1,
  rowSkip: [],
  seatsPerRow: 2,
  overrides: "",
  seatSpacing: 0.4,
  numbering: "ltr",
});

// 10 section cạnh nhau trên trục x, khung nhìn mặc định phủ hết
const venue = buildVenue({
  extent: { w: 20, h: 10 },
  sections: Array.from({ length: 10 }, (_, i) => section(`S${i}`, i * 2)),
});
const { overview, chunks } = splitVenue(venue);
const mapVenue = parseOverview(JSON.parse(serializeGeometry(overview)));
const chunkJson = new Map(
  chunks.map((c) => [
    new URL(c.path, OVERVIEW_URL).href,
    JSON.parse(serializeGeometry(c.chunk)) as unknown,
  ]),
);

type Diff = {
  add?: { properties: { sid: string; color?: string } }[];
  removeAll?: boolean;
  update?: {
    id: string;
    addOrUpdateProperties?: { key: string; value: unknown }[];
    removeProperties?: string[];
  }[];
};

function fakeMap({ zoom = 6, hasSource = true } = {}) {
  const updates: Diff[] = [];
  const source = {
    updateData: vi.fn(async (diff: Diff) => {
      updates.push(diff);
    }),
  };
  const container = { dataset: {} as Record<string, string> };
  const state = { hasSource, moving: false };
  const listeners = new Map<string, Set<() => void>>();
  const map = {
    getZoom: () => zoom,
    getPitch: () => 0,
    isMoving: () => state.moving,
    once: (type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    off: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    getCenter: () => ({ lng: 10, lat: 0.5 }),
    getBounds: () => ({
      getWest: () => -1,
      getSouth: () => -1,
      getEast: () => 21,
      getNorth: () => 2,
    }),
    getContainer: () => container,
    getSource: () => (state.hasSource ? source : undefined),
  };
  return {
    // map giả chỉ có các method loader dùng
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    map: map as unknown as MapLibreMap,
    updates,
    container,
    state,
    /** Camera dừng: bắn moveend cho các listener `once` */
    stop: () => {
      state.moving = false;
      const fns = [...(listeners.get("moveend") ?? [])];
      listeners.delete("moveend");
      fns.forEach((fn) => fn());
    },
    listenerCount: () => listeners.get("moveend")?.size ?? 0,
    addedSids: () =>
      updates.flatMap((u) => (u.add ?? []).map((f) => f.properties.sid)),
  };
}

type Responder = (url: string) => Promise<Response>;

let respond: Responder;
let inFlight = 0;
let peak = 0;
const fetched: string[] = [];

const ok = (url: string) =>
  Promise.resolve(Response.json(chunkJson.get(url) ?? null));

/** Chạy hết microtask / timer đang chờ (fetch giả, rAF giả bằng setTimeout 0) */
const settle = async () => {
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  respond = ok;
  inFlight = 0;
  peak = 0;
  fetched.length = 0;
  vi.stubGlobal("location", { href: "http://localhost:3000/events/x" });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    try {
      return await respond(url);
    } finally {
      inFlight -= 1;
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createSeatLoader", () => {
  it("clears seats left from another venue before loading", () => {
    const { map, updates } = fakeMap();
    createSeatLoader(map, mapVenue, OVERVIEW_URL);
    expect(updates[0]).toEqual({ removeAll: true });
  });

  it("loads every in-view section once, at most 6 at a time, in one batch per frame", async () => {
    const { map, updates, addedSids, container } = fakeMap();
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update([], null);
    loader.update([], null); // camera dừng 2 lần liền: không tải trùng
    await settle();
    expect(fetched).toHaveLength(10);
    expect(new Set(fetched).size).toBe(10);
    expect(peak).toBeLessThanOrEqual(6);
    expect(addedSids().toSorted()).toEqual(
      venue.geojson.seats.features
        .map(
          (f) =>
            `${f.properties.section}|${f.properties.row}|${f.properties.seat}`,
        )
        .toSorted(),
    );
    // removeAll + ít lần add hơn số chunk (gộp theo frame)
    expect(updates.length - 1).toBeLessThan(10);
    expect(container.dataset.seatSections).toBe("10");
  });

  it("holds arrived chunks while the camera moves, adds them once it stops", async () => {
    const { map, addedSids, state, stop, container } = fakeMap();
    state.moving = true;
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null); // section ghim tải ngay cả khi đang bay
    await settle();
    expect(fetched).toHaveLength(1);
    expect(addedSids()).toEqual([]);
    expect(container.dataset.seatSections).toBe("0");
    // đang chờ: update lần nữa không tải trùng
    loader.update(["S0"], null);
    await settle();
    expect(fetched).toHaveLength(1);
    stop();
    await settle();
    expect(addedSids()).toHaveLength(2);
    expect(container.dataset.seatSections).toBe("1");
  });

  it("re-holds a batch if the camera starts moving before the frame runs", async () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => frames.push(cb));
    const { map, addedSids, state, stop } = fakeMap({ zoom: 2 });
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    expect(frames).toHaveLength(1);
    // fetch xong, frame đã hẹn; người dùng bắt đầu kéo trước khi frame chạy
    state.moving = true;
    frames.splice(0).forEach((cb) => cb());
    await settle();
    expect(addedSids()).toEqual([]);
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
      setTimeout(cb, 0),
    );
    stop();
    await settle();
    expect(addedSids()).toHaveLength(2);
  });

  it("removes its moveend listener on dispose", async () => {
    const { map, state, listenerCount } = fakeMap();
    state.moving = true;
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    expect(listenerCount()).toBe(1);
    loader.dispose();
    expect(listenerCount()).toBe(0);
  });

  it("adds seats with their tier colour as a property", async () => {
    const { map, updates } = fakeMap();
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.setColors(new Map([["S0|A|1", "#E4572E"]]));
    loader.update(["S0"], null);
    await settle();
    const added = updates.flatMap((u) => u.add ?? []);
    const bySid = new Map(added.map((f) => [f.properties.sid, f.properties]));
    expect(bySid.get("S0|A|1")?.color).toBe("#E4572E");
    expect(bySid.get("S0|A|2")?.color).toBeUndefined();
  });

  it("recolours already-loaded seats when the colours change", async () => {
    const { map, updates } = fakeMap();
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    updates.length = 0;
    loader.setColors(new Map([["S0|A|1", "#E4572E"]]));
    await settle();
    expect(updates).toEqual([
      {
        update: [
          {
            id: "S0|A|1",
            addOrUpdateProperties: [{ key: "color", value: "#E4572E" }],
          },
        ],
      },
    ]);
    updates.length = 0;
    loader.setColors(new Map([["S0|A|1", "#E4572E"]])); // không đổi → không update
    loader.setColors(new Map());
    await settle();
    expect(updates).toEqual([
      { update: [{ id: "S0|A|1", removeProperties: ["color"] }] },
    ]);
  });

  it("loads nothing at whole-venue zoom", async () => {
    const { map } = fakeMap({ zoom: 2 });
    createSeatLoader(map, mapVenue, OVERVIEW_URL).update([], null);
    await settle();
    expect(fetched).toEqual([]);
  });

  it("drops chunks that arrive after dispose", async () => {
    const { map, addedSids, container } = fakeMap();
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    loader.dispose();
    await settle();
    expect(addedSids()).toEqual([]);
    expect(container.dataset.seatSections).toBeUndefined();
  });

  it("reloads sections whose seats could not be added (source gone)", async () => {
    const { map, addedSids, state } = fakeMap({ zoom: 2 });
    state.hasSource = false;
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    expect(addedSids()).toEqual([]);
    state.hasSource = true;
    loader.update(["S0"], null);
    await settle();
    expect(addedSids()).toHaveLength(2);
  });

  it("retries a failing chunk with backoff, then gives up", async () => {
    respond = () => Promise.reject(new TypeError("network down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map } = fakeMap({ zoom: 2 });
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    expect(fetched).toHaveLength(1);
    // camera dừng / hover đổi liên tục: chưa hết thời gian chờ thì không thử lại
    loader.update(["S0"], null);
    await settle();
    expect(fetched).toHaveLength(1);
    // tự thử lại sau 1s, 4s rồi thôi (tổng 3 lần)
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetched).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4000);
    await settle();
    expect(fetched).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(60_000);
    loader.update(["S0"], null);
    await settle();
    expect(fetched).toHaveLength(3);
    expect(errors).toHaveBeenCalled();
  });

  it("reports each batch of seats once it is in the source", async () => {
    const { map, addedSids } = fakeMap();
    const added: string[] = [];
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL, (seats) =>
      added.push(...seats.map((s) => s.properties.sid)),
    );
    loader.update([], null);
    await settle();
    expect(added.toSorted()).toEqual(addedSids().toSorted());
    expect(added.length).toBeGreaterThan(0);
  });

  it("does not report seats that land after the loader is disposed", async () => {
    const { map } = fakeMap();
    // updateData treo tới khi gọi release(): mô phỏng đổi venue trong lúc ghế đang vào source
    const pending: (() => void)[] = [];
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const source = map.getSource("seats") as unknown as {
      updateData: (diff: unknown) => Promise<void>;
    };
    source.updateData = () =>
      new Promise<void>((resolve) => pending.push(resolve));
    const added: string[] = [];
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL, (seats) =>
      added.push(...seats.map((s) => s.properties.sid)),
    );
    loader.update([], null);
    await settle();
    expect(pending.length).toBeGreaterThan(1); // removeAll + ít nhất 1 đợt add
    loader.dispose();
    for (const release of pending) release();
    await settle();
    expect(added).toEqual([]);
  });

  it("does not retry a chunk the server says is missing", async () => {
    respond = () => Promise.resolve(new Response(null, { status: 404 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map } = fakeMap({ zoom: 2 });
    const loader = createSeatLoader(map, mapVenue, OVERVIEW_URL);
    loader.update(["S0"], null);
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    loader.update(["S0"], null);
    await settle();
    expect(fetched).toHaveLength(1);
  });
});
