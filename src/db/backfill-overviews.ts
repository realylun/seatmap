// Tách geometry của các template version publish trước khi có overview (tải seat map theo tầng).
// Chạy lại an toàn: chỉ xử lý version còn overview_url = null.
import { putJson } from "@/server/blob";
import { backfillOverviews } from "@/server/commands/geometry-split";
import { fetchGeometry } from "@/server/commands/events";
import { isLocalBlobMode } from "@/server/local-blob";
import { getPoolDb } from "./client";

async function main() {
  const db = getPoolDb();
  try {
    const { updated, failed } = await backfillOverviews(
      db,
      putJson,
      fetchGeometry,
    );
    console.info(
      `Backfill overview (${isLocalBlobMode() ? "public/local-blob" : "Vercel Blob"}): ${updated.length} version xong, ${failed.length} lỗi`,
    );
    for (const f of failed) console.error(`  version ${f.id}: ${f.error}`);
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Backfill overview thất bại:", error);
  process.exitCode = 1;
});
