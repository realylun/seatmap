import { beforeEach, describe, expect, it } from "vitest";
import { SEND_INTERVAL_MS, createFpsEngine } from "./fps-engine";
import type { MainToWorker, WorkerToMain } from "./messages";
import type { TelemetryContext } from "./telemetry";

const CTX: TelemetryContext = {
  eventId: "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f",
  sessionId: "sess_abcdefghijklmnop",
  device: {
    deviceClass: "mobile",
    dpr: 3,
    viewportW: 390,
    viewportH: 844,
    cores: null,
    memoryGb: 4,
    gpu: null,
  },
};

function frames(n: number, dt: number, interactive: boolean): MainToWorker {
  return {
    type: "frames",
    buf: Float32Array.from({ length: n }, () => dt),
    flags: Uint8Array.from({ length: n }, () => (interactive ? 1 : 0)),
    len: n,
  };
}

describe("createFpsEngine", () => {
  let emitted: WorkerToMain[];
  let sent: string[];
  let clock: number;

  const make = (withSend = true) =>
    createFpsEngine({
      emit: (m) => emitted.push(m),
      send: withSend ? (json) => void sent.push(json) : null,
      now: () => clock,
    });

  beforeEach(() => {
    emitted = [];
    sent = [];
    clock = 0;
  });

  it("emits overlay stats for every batch, interactive or not", () => {
    const engine = make();
    engine.handle(frames(30, 20, false));
    expect(emitted).toEqual([
      { type: "stats", fps: 50, p95: 20, level: "good" },
    ]);
  });

  it("emits no payload until enough interactive frames and init arrived", () => {
    const engine = make();
    engine.handle(frames(40, 16, true));
    expect(emitted.some((m) => m.type === "payload")).toBe(false);
    engine.handle({ type: "init", ...CTX });
    engine.handle(frames(10, 16, false));
    const payloads = emitted.filter((m) => m.type === "payload");
    expect(payloads).toHaveLength(1);
  });

  it("sends at most once per interval and only with new frames", () => {
    const engine = make();
    engine.handle({ type: "init", ...CTX });
    engine.handle(frames(30, 16, true));
    expect(sent).toHaveLength(1); // lần đầu đủ mẫu thì gửi ngay
    clock = SEND_INTERVAL_MS - 1;
    engine.handle(frames(30, 16, true));
    expect(sent).toHaveLength(1);
    clock = SEND_INTERVAL_MS;
    engine.handle(frames(1, 16, false)); // không có frame tương tác mới
    expect(sent).toHaveLength(2); // nhưng còn 30 frame chưa gửi từ batch trước
    clock = SEND_INTERVAL_MS * 3;
    engine.handle(frames(5, 16, false));
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[1])).toMatchObject({ frames: 60 });
  });

  it("flush sends pending frames immediately", () => {
    const engine = make();
    engine.handle({ type: "init", ...CTX });
    engine.handle(frames(30, 16, true));
    clock = 1;
    engine.handle(frames(5, 16, true));
    expect(sent).toHaveLength(1);
    engine.handle({ type: "flush" });
    expect(sent).toHaveLength(2);
    engine.handle({ type: "flush" });
    expect(sent).toHaveLength(2);
  });

  it("never sends when telemetry is disabled but still emits stats", () => {
    const engine = make(false);
    engine.handle({ type: "init", ...CTX });
    engine.handle(frames(60, 16, true));
    engine.handle({ type: "flush" });
    expect(sent).toEqual([]);
    expect(emitted.some((m) => m.type === "stats")).toBe(true);
    expect(emitted.some((m) => m.type === "payload")).toBe(false);
  });
});
