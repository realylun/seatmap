import { appendToWindow, computeFrameStats, fpsLevel } from "./fps-stats";
import type { MainToWorker, WorkerToMain } from "./messages";
import {
  EMPTY_SESSION,
  type SessionState,
  recordFrames,
} from "./session-accumulator";
import { type TelemetryContext, buildPayload } from "./telemetry";

/** Gửi telemetry định kỳ tối đa 1 lần / khoảng này (ms) */
export const SEND_INTERVAL_MS = 30_000;

export type EngineDeps = {
  readonly emit: (msg: WorkerToMain) => void;
  /** null = tắt telemetry (fallback chạy ở main thread) */
  readonly send: ((json: string) => void) | null;
  readonly now: () => number;
};

type EngineState = {
  readonly window: readonly number[];
  readonly session: SessionState;
  readonly ctx: TelemetryContext | null;
  readonly lastJson: string | null;
  readonly sentFrames: number;
  readonly sentAt: number;
};

const INITIAL: EngineState = {
  window: [],
  session: EMPTY_SESSION,
  ctx: null,
  lastJson: null,
  sentFrames: 0,
  sentAt: Number.NEGATIVE_INFINITY,
};

/**
 * Toàn bộ xử lý FPS (thống kê, histogram, payload, gửi mạng). Chạy trong Web Worker;
 * cùng code chạy ở main thread khi trình duyệt không tạo được worker (send = null).
 */
export function createFpsEngine(deps: EngineDeps) {
  let state = INITIAL;

  const maybeSend = (force: boolean): EngineState => {
    const { send, now } = deps;
    const hasNew = state.session.frames > state.sentFrames;
    const due = force || now() - state.sentAt >= SEND_INTERVAL_MS;
    if (!send || !state.lastJson || !hasNew || !due) return state;
    send(state.lastJson);
    return { ...state, sentFrames: state.session.frames, sentAt: now() };
  };

  const refreshPayload = (): EngineState => {
    if (!deps.send || !state.ctx) return state;
    const payload = buildPayload(state.session, state.ctx);
    const json = payload ? JSON.stringify(payload) : null;
    if (!json || json === state.lastJson) return state;
    deps.emit({ type: "payload", json });
    return { ...state, lastJson: json };
  };

  const onFrames = (buf: Float32Array, flags: Uint8Array, len: number) => {
    const window = appendToWindow(
      state.window,
      Array.from(buf.subarray(0, len)),
    );
    const stats = computeFrameStats(window);
    deps.emit({
      type: "stats",
      fps: stats.fps,
      p95: stats.p95,
      level: fpsLevel(stats.fps),
    });
    state = {
      ...state,
      window,
      session: recordFrames(state.session, buf, flags, len),
    };
  };

  return {
    handle(msg: MainToWorker) {
      switch (msg.type) {
        case "init":
          state = {
            ...state,
            ctx: {
              eventId: msg.eventId,
              sessionId: msg.sessionId,
              device: msg.device,
            },
          };
          state = refreshPayload();
          return;
        case "frames":
          onFrames(msg.buf, msg.flags, msg.len);
          state = refreshPayload();
          state = maybeSend(false);
          return;
        case "flush":
          state = maybeSend(true);
          return;
      }
    },
  };
}
