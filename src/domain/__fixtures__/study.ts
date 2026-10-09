// Chỉ dùng trong test. Venue mẫu nằm trong repo (data/venues); code JS gốc để chạy parity test
// nằm ở repo nghiên cứu seatgeek-study ngoài project → test parity tự skip nếu không có (vd. CI).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const STUDY_DIR =
  process.env.SEATGEEK_STUDY_DIR ??
  fileURLToPath(new URL("../../../../seatgeek-study/", import.meta.url));

export const EDITOR_DIR = join(STUDY_DIR, "seatmap-editor");

export const hasStudy = existsSync(join(EDITOR_DIR, "geometry.js"));

/** Venue mẫu: ưu tiên bản copy trong repo, thiếu thì đọc từ seatgeek-study */
export const VENUE_DATA_DIR = fileURLToPath(
  new URL("../../../data/venues/", import.meta.url),
);

const venueDir = existsSync(VENUE_DATA_DIR) ? VENUE_DATA_DIR : EDITOR_DIR;

export const hasVenueData = existsSync(join(venueDir, "venue.rosetta.json"));

export const VENUE_FILES = ["venue.sample.json", "venue.rosetta.json"] as const;

const cache = new Map<string, unknown>();

export function loadVenueJson(name: (typeof VENUE_FILES)[number]): unknown {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const json: unknown = JSON.parse(readFileSync(join(venueDir, name), "utf8"));
  cache.set(name, json);
  return json;
}

/** Import module JS gốc theo đường dẫn tuyệt đối (specifier động → tsc không type-check file JS) */
export async function importStudyModule<T>(relativePath: string): Promise<T> {
  const specifier: string = join(STUDY_DIR, relativePath);
  const mod: T = await import(/* @vite-ignore */ specifier);
  return mod;
}
