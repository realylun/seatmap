import type { FpsPayload } from "@/server/telemetry/fps-schema";
import { type SessionState, sessionSummary } from "./session-accumulator";

export const TELEMETRY_ENDPOINT = "/api/telemetry/fps";
/** Phiên ít frame tương tác hơn mức này thì không gửi (quá ít mẫu) */
export const MIN_FRAMES = 30;
/** Khớp GPU_MAX_LENGTH ở fps-schema; không import để bundle worker không kéo theo zod */
const GPU_MAX_LENGTH = 120;

export type DeviceInfo = Pick<
  FpsPayload,
  | "deviceClass"
  | "dpr"
  | "viewportW"
  | "viewportH"
  | "cores"
  | "memoryGb"
  | "gpu"
>;

export type TelemetryContext = {
  readonly eventId: string;
  readonly sessionId: string;
  readonly device: DeviceInfo;
};

export function buildPayload(
  session: SessionState,
  ctx: TelemetryContext,
): FpsPayload | null {
  if (session.frames < MIN_FRAMES) return null;
  const s = sessionSummary(session);
  return {
    sessionId: ctx.sessionId,
    eventId: ctx.eventId,
    avgFps: s.avgFps,
    p50FrameMs: s.p50FrameMs,
    p95FrameMs: s.p95FrameMs,
    longFrames: s.longFrames,
    frames: s.frames,
    interactionMs: Math.round(s.interactionMs),
    ...ctx.device,
  };
}

/** Phần của WebGL context / canvas cần để đọc tên GPU (canvas thật thoả kiểu này) */
type WebGlLike = {
  readonly RENDERER: number;
  getExtension(
    name: "WEBGL_debug_renderer_info",
  ): { readonly UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(pname: number): unknown;
};
export type CanvasLike = {
  getContext(contextId: "webgl2" | "webgl"): WebGlLike | null;
};

/** Tên GPU từ WebGL context sẵn có của map (không tạo context mới) */
function gpuRenderer(canvas: CanvasLike | null): string | null {
  try {
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = gl.getParameter(
      ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    );
    return typeof name === "string" ? name.slice(0, GPU_MAX_LENGTH) : null;
  } catch {
    // Trình duyệt chặn thông tin GPU → bỏ qua trường này
    return null;
  }
}

/** Chạy 1 lần ở main thread (cần window/WebGL) rồi gửi sang worker */
export function collectDeviceInfo(canvas: CanvasLike | null): DeviceInfo {
  const nav: Navigator & { deviceMemory?: number } = navigator;
  return {
    deviceClass: window.matchMedia("(pointer: coarse)").matches
      ? "mobile"
      : "desktop",
    dpr: window.devicePixelRatio || 1,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    cores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    gpu: gpuRenderer(canvas),
  };
}
