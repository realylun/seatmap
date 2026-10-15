// Upload geometry tải theo tầng (overview + chunk ghế theo section, domain/venue/split.ts) cạnh file
// đầy đủ: geometry/{template}/v{n}-{id}/overview.json + s/{i}.json. File đầy đủ vẫn giữ cho server
// snapshot và trang admin gán ghế.
import { eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { templateVersions } from "@/db/schema";
import { serializeGeometry } from "@/domain/venue/geometry-json";
import { splitVenue, type ChunkFile } from "@/domain/venue/split";
import type { Venue } from "@/domain/venue/types";
import type { PutJson } from "../blob";
import type { Db } from "../inventory/db";
import type { LoadGeometry } from "./events";

/** Đường dẫn có version nên nội dung không bao giờ đổi → cache 1 năm */
export const GEOMETRY_CACHE_MAX_AGE = 365 * 24 * 60 * 60;
/** Số upload chunk chạy song song: venue 160 section không dồn 160 request vào Blob cùng lúc */
const UPLOAD_CONCURRENCY = 8;

export const IMMUTABLE = { cacheControlMaxAge: GEOMETRY_CACHE_MAX_AGE };

/**
 * Thư mục riêng cho mỗi lần upload: 2 lần publish cùng lúc tính ra cùng số version (latest + 1),
 * dùng chung thư mục thì chunk của bản này đè chunk của bản kia và bị cache 1 năm.
 */
export const versionDir = (templateId: string, version: number) =>
  `geometry/${templateId}/v${version}-${nanoid(8)}`;

async function uploadChunks(
  putJson: PutJson,
  dir: string,
  chunks: readonly ChunkFile[],
): Promise<void> {
  let next = 0;
  // 1 chunk lỗi → các worker khác thôi nhận chunk mới thay vì upload tiếp sau khi đã báo lỗi
  let failed = false;
  const worker = async () => {
    while (!failed && next < chunks.length) {
      const { path, chunk } = chunks[next++];
      try {
        await putJson(`${dir}/${path}`, serializeGeometry(chunk), IMMUTABLE);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const workers = Math.min(UPLOAD_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: workers }, worker));
}

/**
 * Upload chunk trước, overview sau cùng: overview chỉ tồn tại khi mọi chunk nó trỏ tới đã có.
 * Trả về URL overview (chunk path trong overview là tương đối so với URL này).
 */
export async function uploadSplitGeometry(
  putJson: PutJson,
  dir: string,
  venue: Venue,
): Promise<string> {
  const { overview, chunks } = splitVenue(venue);
  await uploadChunks(putJson, dir, chunks);
  const { url } = await putJson(
    `${dir}/overview.json`,
    serializeGeometry(overview),
    IMMUTABLE,
  );
  return url;
}

export type BackfillResult = {
  readonly updated: readonly string[];
  readonly failed: readonly { readonly id: string; readonly error: string }[];
};

/**
 * Tách các version publish trước khi có overview; chạy lại thì bỏ qua version đã có. 1 version lỗi
 * (geometry 404, sai schema...) không chặn các version sau, được trả về trong `failed`.
 */
export async function backfillOverviews(
  db: Db,
  putJson: PutJson,
  loadGeometry: LoadGeometry,
): Promise<BackfillResult> {
  const pending = await db
    .select({
      id: templateVersions.id,
      templateId: templateVersions.templateId,
      version: templateVersions.version,
      geometryUrl: templateVersions.geometryUrl,
    })
    .from(templateVersions)
    .where(isNull(templateVersions.overviewUrl));
  const updated: string[] = [];
  const failed: { id: string; error: string }[] = [];
  // tuần tự: mỗi version phải tải cả file đầy đủ (vài chục MB với venue lớn)
  for (const v of pending) {
    try {
      const venue = await loadGeometry(v.geometryUrl);
      const overviewUrl = await uploadSplitGeometry(
        putJson,
        versionDir(v.templateId, v.version),
        venue,
      );
      await db
        .update(templateVersions)
        .set({ overviewUrl })
        .where(eq(templateVersions.id, v.id));
      updated.push(v.id);
    } catch (error) {
      failed.push({
        id: v.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { updated, failed };
}
