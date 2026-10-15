import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerLike } from "./fps-sink";
import type { MainToWorker, WorkerToMain } from "./messages";
import { startMeter, type MeterMap } from "./use-fps-meter";

const EVENT_ID = "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f";

class FakeWorker implements WorkerLike {
  posted: MainToWorker[] = [];
  terminated = false;
  onMessage: ((e: MessageEvent<WorkerToMain>) => void) | null = null;
  postMessage(msg: MainToWorker) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  addEventListener(
    type: "message",
    listener: (e: MessageEvent<WorkerToMain>) => void,
  ): void;
  addEventListener(type: "error", listener: (e: Event) => void): void;
  addEventListener(
    type: "message" | "error",
    listener: ((e: MessageEvent<WorkerToMain>) => void) & ((e: Event) => void),
  ) {
    if (type === "message") this.onMessage = listener;
  }
  reply(data: WorkerToMain) {
    this.onMessage?.(new MessageEvent("message", { data }));
  }
}

/** EventTarget tối giản cho document/window giả */
function fakeTarget<T extends object>(extra: T) {
  const listeners = new Map<string, Set<() => void>>();
  return Object.assign(extra, {
    listeners,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn));
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  });
}

const payload = (frames: number) =>
  JSON.stringify({ sessionId: "s", eventId: EVENT_ID, frames });

describe("startMeter", () => {
  let rafCallbacks: FrameRequestCallback[];
  let beacons: { url: string; body: Blob }[];
  let doc: ReturnType<typeof fakeTarget<{ visibilityState: string }>>;
  let win: ReturnType<typeof fakeTarget<Record<string, unknown>>>;
  let worker: FakeWorker;
  const mapHandlers = new Map<string, () => void>();
  const map: MeterMap = {
    on: (type, fn) => mapHandlers.set(type, fn),
    off: (type) => mapHandlers.delete(type),
    getCanvas: () => null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    beacons = [];
    worker = new FakeWorker();
    mapHandlers.clear();
    doc = fakeTarget({ visibilityState: "visible" });
    win = fakeTarget<Record<string, unknown>>({
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 2,
      innerWidth: 1280,
      innerHeight: 720,
    });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", {
      hardwareConcurrency: 8,
      sendBeacon: (url: string, body: Blob) => beacons.push({ url, body }),
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const start = (onStats = vi.fn()) => ({
    onStats,
    stop: startMeter(map, EVENT_ID, onStats, () => worker),
  });
  const runFrames = (n: number) => {
    for (let i = 0; i <= n; i++) rafCallbacks[rafCallbacks.length - 1](i * 16);
  };

  it("initialises the worker with event, session and device info", () => {
    start();
    expect(worker.posted[0]).toMatchObject({
      type: "init",
      eventId: EVENT_ID,
      device: { deviceClass: "desktop", dpr: 2, viewportW: 1280, cores: 8 },
    });
    expect(worker.posted[0]).toHaveProperty(
      "sessionId",
      expect.stringMatching(/^[\w-]{21}$/),
    );
  });

  it("ships frame batches to the worker every 500ms", () => {
    start();
    mapHandlers.get("movestart")?.();
    runFrames(3);
    expect(worker.posted).toHaveLength(1);
    vi.advanceTimersByTime(500);
    const batch = worker.posted[1];
    if (batch.type !== "frames") throw new Error("expected frames");
    expect(batch.len).toBe(3);
    expect(Array.from(batch.flags.subarray(0, 3))).toEqual([1, 1, 1]);
  });

  it("forwards stats from the worker to the overlay", () => {
    const { onStats } = start();
    worker.reply({ type: "stats", fps: 58, p95: 18, level: "good" });
    expect(onStats).toHaveBeenCalledWith({ fps: 58, p95: 18, level: "good" });
  });

  it("asks the worker to flush when the tab becomes hidden", () => {
    start();
    runFrames(2);
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(worker.posted.map((m) => m.type)).toEqual([
      "init",
      "frames",
      "flush",
    ]);
  });

  it("beacons the latest payload on pagehide, once per payload", () => {
    start();
    win.fire("pagehide");
    expect(beacons).toEqual([]); // chưa có payload
    worker.reply({ type: "payload", json: payload(40) });
    win.fire("pagehide");
    win.fire("pagehide");
    expect(beacons).toHaveLength(1);
    expect(beacons[0].url).toBe("/api/telemetry/fps");
    expect(beacons[0].body.type).toBe("application/json");
  });

  it("flushes pending frames to the worker before unmounting", () => {
    const { stop } = start();
    runFrames(3);
    stop();
    expect(worker.posted.map((m) => m.type)).toEqual(["init", "frames"]);
  });

  it("cleans up and sends the final payload on unmount", async () => {
    const { stop } = start();
    worker.reply({ type: "payload", json: payload(50) });
    stop();
    expect(worker.terminated).toBe(true);
    expect(mapHandlers.size).toBe(0);
    expect(doc.listeners.get("visibilitychange")?.size).toBe(0);
    expect(win.listeners.get("pagehide")?.size).toBe(0);
    expect(beacons).toHaveLength(1);
    expect(JSON.parse(await beacons[0].body.text())).toMatchObject({
      frames: 50,
    });
    vi.advanceTimersByTime(1000);
    expect(worker.posted.filter((m) => m.type === "frames")).toEqual([]);
  });

  it("never throws when sendBeacon fails during page teardown", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("blocked");
      },
    });
    start();
    worker.reply({ type: "payload", json: payload(40) });
    expect(() => win.fire("pagehide")).not.toThrow();
  });
});
