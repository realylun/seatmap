import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import {
  MAX_FPS_BODY_BYTES,
  USER_AGENT_MAX_LENGTH,
  fpsPayloadSchema,
} from "@/server/telemetry/fps-schema";
import { recordFpsSample } from "@/server/telemetry/record-fps";

const NO_STORE = { "Cache-Control": "no-store" };

const error = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: NO_STORE });

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Nhận telemetry FPS seatmap (fetch keepalive từ worker hoặc sendBeacon khi rời trang). */
export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FPS_BODY_BYTES) return error(400, "Body too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_FPS_BODY_BYTES) {
    return error(400, "Body too large");
  }
  const parsed = fpsPayloadSchema.safeParse(parseJson(text));
  if (!parsed.success) return error(400, "Invalid payload");

  const userAgent = (req.headers.get("user-agent") ?? "").slice(
    0,
    USER_AGENT_MAX_LENGTH,
  );
  try {
    const result = await recordFpsSample(getDb(), {
      ...parsed.data,
      userAgent,
    });
    if (!result.ok) return error(404, "Event not found");
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    console.error("fps telemetry failed", {
      eventId: parsed.data.eventId,
      sessionId: parsed.data.sessionId,
      error: err,
    });
    return error(500, "Could not record telemetry");
  }
}
