import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCachedSeatLayout } from "@/server/queries/seat-layout";

const NO_STORE = { "Cache-Control": "no-store" };
// Layout chỉ đổi khi admin gán tier: CDN giữ 60s (+60s stale khi đang revalidate) — đây là lớp
// chắn egress chính. Admin thêm `?fresh=` sau khi sửa để bỏ qua CDN.
const LAYOUT_CDN_CACHE = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
};

/** Bố cục tĩnh: tiers + sid của mọi ghế gom theo tier. Client tải một lần, chỉ poll /availability. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/events/[id]/layout">,
) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json(
      { error: "Invalid event id" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const layout = await getCachedSeatLayout(id);
    return Response.json(layout, { headers: LAYOUT_CDN_CACHE });
  } catch (error) {
    console.error("seat layout failed", { eventId: id, error });
    return Response.json(
      { error: "Could not load seat layout" },
      { status: 500, headers: NO_STORE },
    );
  }
}
