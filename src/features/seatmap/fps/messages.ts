import type { FpsLevel } from "./fps-stats";
import type { TelemetryContext } from "./telemetry";

/** Main thread → worker FPS */
export type MainToWorker =
  | ({ readonly type: "init" } & TelemetryContext)
  | {
      readonly type: "frames";
      /** frame time (ms); chỉ `len` phần tử đầu có nghĩa */
      readonly buf: Float32Array;
      /** 1 = frame nằm trong lúc map đang di chuyển */
      readonly flags: Uint8Array;
      readonly len: number;
    }
  | { readonly type: "flush" };

export type FpsStats = {
  readonly fps: number;
  readonly p95: number;
  readonly level: FpsLevel;
};

/** Worker → main thread */
export type WorkerToMain =
  | ({ readonly type: "stats" } & FpsStats)
  | { readonly type: "payload"; readonly json: string };
