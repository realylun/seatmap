import { afterEach, describe, expect, it, vi } from "vitest";
import { type WorkerLike, createFpsSink } from "./fps-sink";
import type { MainToWorker, WorkerToMain } from "./messages";

const frames = (n: number): MainToWorker => ({
  type: "frames",
  buf: Float32Array.from({ length: n }, () => 20),
  flags: new Uint8Array(n),
  len: n,
});

class FakeWorker implements WorkerLike {
  posted: { msg: unknown; transfer: Transferable[] | undefined }[] = [];
  terminated = false;
  onMessage: ((e: MessageEvent<WorkerToMain>) => void) | null = null;
  onError: ((e: Event) => void) | null = null;
  postMessage(msg: MainToWorker, transfer: Transferable[]) {
    this.posted.push({ msg, transfer });
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
    else this.onError = listener;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFpsSink", () => {
  it("forwards messages to the worker with the transfer list", () => {
    const worker = new FakeWorker();
    const sink = createFpsSink(
      () => undefined,
      () => worker,
    );
    const msg = frames(2);
    const transfer = [new ArrayBuffer(1)];
    sink.post(msg, transfer);
    expect(worker.posted).toEqual([{ msg, transfer }]);
    sink.terminate();
    expect(worker.terminated).toBe(true);
  });

  it("relays worker messages to the callback", () => {
    const worker = new FakeWorker();
    const received: WorkerToMain[] = [];
    createFpsSink(
      (m) => received.push(m),
      () => worker,
    );
    const stats: WorkerToMain = {
      type: "stats",
      fps: 60,
      p95: 17,
      level: "good",
    };
    worker.onMessage?.(new MessageEvent("message", { data: stats }));
    expect(received).toEqual([stats]);
  });

  it("falls back to main-thread stats without telemetry when Worker is unavailable", () => {
    const received: WorkerToMain[] = [];
    const sink = createFpsSink((m) => received.push(m), null);
    expect(() => sink.post(frames(30))).not.toThrow();
    expect(received).toEqual([
      { type: "stats", fps: 50, p95: 20, level: "good" },
    ]);
  });

  it("never emits telemetry payloads in fallback mode", () => {
    const received: WorkerToMain[] = [];
    const sink = createFpsSink((m) => received.push(m), null);
    sink.post({
      type: "init",
      eventId: "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f",
      sessionId: "sess_fallback_0001",
      device: {
        deviceClass: "desktop",
        dpr: 1,
        viewportW: 800,
        viewportH: 600,
        cores: null,
        memoryGb: null,
        gpu: null,
      },
    });
    sink.post({
      type: "frames",
      buf: Float32Array.from({ length: 60 }, () => 16),
      flags: Uint8Array.from({ length: 60 }, () => 1),
      len: 60,
    });
    sink.post({ type: "flush" });
    expect(received.map((m) => m.type)).toEqual(["stats"]);
  });

  it("falls back when the worker constructor throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const received: WorkerToMain[] = [];
    const sink = createFpsSink(
      (m) => received.push(m),
      () => {
        throw new Error("blocked by CSP");
      },
    );
    sink.post(frames(10));
    expect(received[0]?.type).toBe("stats");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("switches to the fallback when the worker script fails to load", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const worker = new FakeWorker();
    const received: WorkerToMain[] = [];
    const sink = createFpsSink(
      (m) => received.push(m),
      () => worker,
    );
    worker.onError?.(new Event("error"));
    expect(worker.terminated).toBe(true);
    sink.post(frames(10));
    expect(worker.posted).toEqual([]);
    expect(received[0]?.type).toBe("stats");
  });
});
