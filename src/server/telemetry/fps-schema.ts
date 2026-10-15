import { z } from "zod";

/** Body tối đa của POST /api/telemetry/fps (byte) */
export const MAX_FPS_BODY_BYTES = 2048;
export const GPU_MAX_LENGTH = 120;
export const USER_AGENT_MAX_LENGTH = 300;

const clamped = (min: number, max: number) =>
  z
    .number()
    .finite()
    .transform((v) => Math.min(max, Math.max(min, v)));

const clampedInt = (max: number) =>
  z
    .number()
    .int()
    .transform((v) => Math.min(max, Math.max(0, v)));

/** Payload telemetry FPS client gửi lên; số ngoài khoảng hợp lý bị kẹp lại thay vì từ chối */
export const fpsPayloadSchema = z.strictObject({
  sessionId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[\w-]+$/),
  eventId: z.uuid(),
  avgFps: clamped(0, 240),
  p50FrameMs: clamped(0, 10_000),
  p95FrameMs: clamped(0, 10_000),
  longFrames: clampedInt(10_000_000),
  frames: z
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(100_000_000, v)),
  interactionMs: clampedInt(1_000_000_000),
  deviceClass: z.enum(["mobile", "desktop"]),
  dpr: clamped(0, 10),
  viewportW: clampedInt(20_000),
  viewportH: clampedInt(20_000),
  cores: clampedInt(1024).nullable(),
  memoryGb: clamped(0, 1024).nullable(),
  // Postgres text không nhận ký tự NUL → chặn ở đây thay vì để insert lỗi 500
  gpu: z
    .string()
    .max(GPU_MAX_LENGTH)
    .refine((s) => !s.includes("\0"), "NUL byte")
    .nullable(),
});

export type FpsPayload = z.input<typeof fpsPayloadSchema>;
export type FpsSampleInput = z.output<typeof fpsPayloadSchema>;
