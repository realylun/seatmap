import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_FRAME_GAP_MS,
  startFrameLoop,
  type MoveEmitter,
} from "./frame-loop";

function fakeMap() {
  const handlers = new Map<string, () => void>();
  const map: MoveEmitter = {
    on: (type, fn) => {
      handlers.set(type, fn);
    },
    off: (type) => {
      handlers.delete(type);
    },
  };
  return { map, fire: (type: string) => handlers.get(type)?.(), handlers };
}

describe("startFrameLoop", () => {
  let callbacks: FrameRequestCallback[];
  let cancelled: number[];

  beforeEach(() => {
    callbacks = [];
    cancelled = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const frame = (t: number) => callbacks[callbacks.length - 1](t);

  it("pushes frame deltas flagged by map movement", () => {
    const { map, fire } = fakeMap();
    const pushed: [number, boolean][] = [];
    startFrameLoop(map, { push: (dt, i) => pushed.push([dt, i]) });
    frame(1000); // frame đầu chỉ ghi mốc
    frame(1016);
    fire("movestart");
    frame(1036);
    fire("moveend");
    frame(1052);
    expect(pushed).toEqual([
      [16, false],
      [20, true],
      [16, false],
    ]);
  });

  it("skips gaps longer than the limit (tab returned from background)", () => {
    const { map } = fakeMap();
    const pushed: number[] = [];
    startFrameLoop(map, { push: (dt) => pushed.push(dt) });
    frame(0);
    frame(MAX_FRAME_GAP_MS + 1);
    frame(MAX_FRAME_GAP_MS + 17);
    expect(pushed).toEqual([16]);
  });

  it("stops the loop and unsubscribes on cleanup", () => {
    const { map, handlers } = fakeMap();
    const stop = startFrameLoop(map, { push: () => undefined });
    expect(handlers.size).toBe(2);
    stop();
    expect(cancelled).toEqual([1]);
    expect(handlers.size).toBe(0);
  });
});
