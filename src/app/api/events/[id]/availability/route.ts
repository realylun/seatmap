import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getAvailability } from "@/server/inventory/availability";

const NO_STORE = { "Cache-Control": "no-store" };
// Cache CDN rất ngắn để gộp poll của nhiều người xem; client thêm `?fresh=` sau thao tác giữ ghế
// để bỏ qua bản cache (CDN Vercel tính query string vào cache key).
const SHORT_CDN_CACHE = {
  "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5",
};

/** Trạng thái ghế động: không cache, client poll 15s. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/events/[id]/availability">,
) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json(
      { error: "Invalid event id" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const availability = await getAvailability(getDb(), id);
    return Response.json(availability, { headers: SHORT_CDN_CACHE });
  } catch (error) {
    console.error("availability failed", { eventId: id, error });
    return Response.json(
      { error: "Could not load availability" },
      { status: 500, headers: NO_STORE },
    );
  }
}
