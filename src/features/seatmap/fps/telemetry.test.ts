import { afterEach, describe, expect, it, vi } from "vitest";
import { fpsPayloadSchema } from "@/server/telemetry/fps-schema";
import { EMPTY_SESSION, recordFrames } from "./session-accumulator";
import {
  MIN_FRAMES,
  buildPayload,
  type CanvasLike,
  collectDeviceInfo,
  type TelemetryContext,
} from "./telemetry";

const CTX: TelemetryContext = {
  eventId: "8f9d6c2e-1b7a-4c3d-9e5f-0a1b2c3d4e5f",
  sessionId: "sess_abcdefghijklmnop",
  device: {
    deviceClass: "desktop",
    dpr: 2,
    viewportW: 1440,
    viewportH: 900,
    cores: 8,
    memoryGb: null,
    gpu: "Apple M2",
  },
};

function sessionWith(frames: number, dt = 16) {
  return recordFrames(
    EMPTY_SESSION,
    Float32Array.from({ length: frames }, () => dt),
    Uint8Array.from({ length: frames }, () => 1),
    frames,
  );
}

describe("buildPayload", () => {
  it("returns null below the minimum sample size", () => {
    expect(MIN_FRAMES).toBe(30);
    expect(buildPayload(sessionWith(29), CTX)).toBeNull();
  });

  it("builds a payload the server schema accepts", () => {
    const payload = buildPayload(sessionWith(30), CTX);
    expect(payload).toMatchObject({
      sessionId: CTX.sessionId,
      eventId: CTX.eventId,
      frames: 30,
      interactionMs: 480,
      p95FrameMs: 16,
      longFrames: 0,
      deviceClass: "desktop",
      gpu: "Apple M2",
    });
    expect(payload?.avgFps).toBeCloseTo(62.5, 5);
    expect(fpsPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

function stubBrowser(coarse: boolean) {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: coarse }),
    devicePixelRatio: 3,
    innerWidth: 390,
    innerHeight: 844,
  });
  vi.stubGlobal("navigator", { hardwareConcurrency: 6, deviceMemory: 4 });
}

const canvasWith = (gl: ReturnType<CanvasLike["getContext"]>): CanvasLike => ({
  getContext: () => gl,
});

describe("collectDeviceInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads viewport, pointer type and the unmasked GPU name", () => {
    stubBrowser(true);
    const gl = {
      RENDERER: 1,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
      getParameter: (p: number) => (p === 2 ? "G".repeat(200) : "masked"),
    };
    expect(collectDeviceInfo(canvasWith(gl))).toEqual({
      deviceClass: "mobile",
      dpr: 3,
      viewportW: 390,
      viewportH: 844,
      cores: 6,
      memoryGb: 4,
      gpu: "G".repeat(120),
    });
  });

  it("falls back to the masked renderer and tolerates missing WebGL", () => {
    stubBrowser(false);
    const masked = {
      RENDERER: 1,
      getExtension: () => null,
      getParameter: () => "WebKit WebGL",
    };
    expect(collectDeviceInfo(canvasWith(masked))).toMatchObject({
      deviceClass: "desktop",
      gpu: "WebKit WebGL",
    });
    expect(collectDeviceInfo(canvasWith(null)).gpu).toBeNull();
    expect(collectDeviceInfo(null).gpu).toBeNull();
    const throwing = canvasWith({
      RENDERER: 1,
      getParameter: () => null,
      getExtension: () => {
        throw new Error("lost context");
      },
    });
    expect(collectDeviceInfo(throwing).gpu).toBeNull();
  });
});
