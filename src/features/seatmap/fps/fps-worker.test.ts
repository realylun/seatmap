import { afterEach, describe, expect, it, vi } from "vitest";
import type { MainToWorker, WorkerToMain } from "./messages";

const CTX = {
  eventId: "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f",
  sessionId: "sess_worker_000001",
  device: {
    deviceClass: "desktop" as const,
    dpr: 1,
    viewportW: 800,
    viewportH: 600,
    cores: 4,
    memoryGb: 8,
    gpu: null,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Nạp fps.worker.ts với `self` và `fetch` giả để kiểm tra lớp nối message */
async function loadWorker(fetchImpl: () => Promise<Response>) {
  let onMessage: ((e: { data: MainToWorker }) => void) | null = null;
  const posted: WorkerToMain[] = [];
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("self", {
    postMessage: (m: WorkerToMain) => posted.push(m),
    addEventListener: (_type: string, fn: typeof onMessage) => {
      onMessage = fn;
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  await import("./fps.worker");
  const send = (data: MainToWorker) => onMessage?.({ data });
  return { posted, fetchMock, send };
}

const frames = (n: number): MainToWorker => ({
  type: "frames",
  buf: Float32Array.from({ length: n }, () => 16),
  flags: Uint8Array.from({ length: n }, () => 1),
  len: n,
});

describe("fps.worker", () => {
  it("posts stats back and sends telemetry with fetch keepalive", async () => {
    const w = await loadWorker(async () => new Response(null, { status: 204 }));
    w.send({ type: "init", ...CTX });
    w.send(frames(30));
    expect(w.posted.map((m) => m.type)).toEqual(["stats", "payload"]);
    expect(w.fetchMock).toHaveBeenCalledWith(
      "/api/telemetry/fps",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  it("swallows network errors with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = await loadWorker(() => Promise.reject(new Error("offline")));
    w.send({ type: "init", ...CTX });
    w.send(frames(30));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warn.mockRestore();
  });
});
