// Seed toàn bộ dữ liệu demo qua đúng các command mà admin dùng (venue → template → publish
// version → event + snapshot ghế → tier → gán tier). IO (Blob, file) được tiêm vào để test trên PGlite.
import { eq, sql } from "drizzle-orm";
import { templateVersions, templates } from "@/db/schema";
import { venueSchema, type Point, type Venue } from "@/domain/venue/types";
import type { PutJson } from "@/server/blob";
import {
  advanceEventStatus,
  assignTierToSections,
  createEvent,
  createTier,
  setTrending,
} from "@/server/commands/events";
import {
  createTemplate,
  publishVersion,
  type PublishedVersion,
} from "@/server/commands/templates";
import { createVenue, type CommandResult } from "@/server/commands/venues";
import type { Db } from "@/server/inventory/db";
import {
  eventImageUrl,
  SEED_EVENTS,
  SEED_TIERS,
  SEED_VENUES,
  SHOW_TIME_UTC,
  type SeedEvent,
  type SeedMapKey,
} from "./data";

export type SeedDeps = {
  /** Upload geometry JSON (Blob thật hoặc giả lập) */
  readonly putJson: PutJson;
  /** Nội dung venue.json (đã parse) cho từng map */
  readonly venueFiles: Readonly<Record<SeedMapKey, unknown>>;
  /** URL ảnh nền đã upload cho template, nếu có */
  readonly backgroundUrls?: Partial<Record<SeedMapKey, string>>;
  readonly now?: Date;
};

export type SeedSummary = {
  readonly venues: number;
  readonly versions: readonly (PublishedVersion & {
    readonly map: SeedMapKey;
  })[];
  readonly events: number;
  readonly seats: number;
};

const APP_TABLES =
  "order_items, orders, event_seats, holds, price_tiers, events, template_versions, templates, venues";

function must<T>(result: CommandResult<T>, step: string): T {
  if (!result.ok)
    throw new Error(`Seed thất bại ở bước "${step}": ${result.error}`);
  return result.value;
}

// LCG có seed (giống seatmap-demo/listings.js) → mỗi lần seed ra cùng dữ liệu
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function hashString(text: string): number {
  let hash = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i += 1)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

/**
 * Chia section vào các tier: gần tâm sân → tier đắt (index 0). 20% section bị đẩy lệch 1 tier
 * (theo PRNG có seed) cho bảng giá trông tự nhiên. Trả về danh sách section id theo từng tier.
 */
export function planTierSections(
  sections: readonly { readonly id: string; readonly center: Point }[],
  tierCount: number,
  seed: number,
): string[][] {
  const rand = seededRandom(seed);
  const ranked = sections.toSorted(
    (a, b) => Math.hypot(...a.center) - Math.hypot(...b.center),
  );
  const assigned = ranked.map((s, rank) => {
    const base = Math.floor((rank * tierCount) / ranked.length);
    const roll = rand();
    const shift = roll < 0.1 ? -1 : roll < 0.2 ? 1 : 0;
    return {
      id: s.id,
      tier: Math.min(tierCount - 1, Math.max(0, base + shift)),
    };
  });
  return Array.from({ length: tierCount }, (_, t) =>
    assigned.filter((a) => a.tier === t).map((a) => a.id),
  );
}

export function startsAt(now: Date, inDays: number): Date {
  const day = new Date(now.getTime() + inDays * 86_400_000);
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      SHOW_TIME_UTC.hours,
      SHOW_TIME_UTC.minutes,
    ),
  );
}

async function seedVenue(
  db: Db,
  deps: SeedDeps,
  key: SeedMapKey,
  putJson: PutJson,
) {
  const def = SEED_VENUES.find((v) => v.key === key);
  if (!def) throw new Error(`Thiếu định nghĩa venue "${key}"`);
  const venueId = must(await createVenue(db, def), `venue ${def.name}`);
  const templateId = must(
    await createTemplate(db, {
      venueId,
      name: def.templateName,
      venueJson: deps.venueFiles[key],
    }),
    `template ${def.templateName}`,
  );
  const backgroundUrl = deps.backgroundUrls?.[key];
  if (backgroundUrl) {
    await db
      .update(templates)
      .set({ backgroundImageUrl: backgroundUrl })
      .where(eq(templates.id, templateId));
  }
  const version = must(
    await publishVersion(db, putJson, templateId),
    `publish ${def.templateName}`,
  );
  return { ...version, map: key };
}

async function seedEvent(
  db: Db,
  event: SeedEvent,
  versionId: string,
  geometry: Venue,
  deps: SeedDeps,
) {
  const created = must(
    await createEvent(db, async () => geometry, {
      name: event.name,
      slug: event.slug,
      category: event.category,
      startsAt: startsAt(deps.now ?? new Date(), event.inDays),
      templateVersionId: versionId,
      imageUrl: eventImageUrl(event.slug),
    }),
    `event ${event.slug}`,
  );
  must(await advanceEventStatus(db, created.id), `mở bán ${event.slug}`);
  await setTrending(db, created.id, event.trending);
  const tiers = SEED_TIERS[event.category];
  const plan = planTierSections(
    geometry.sections,
    tiers.length,
    hashString(event.slug),
  );
  for (const [i, tier] of tiers.entries()) {
    const tierId = must(
      await createTier(db, created.id, tier),
      `tier ${tier.name} của ${event.slug}`,
    );
    await assignTierToSections(db, created.id, plan[i], tierId);
  }
  return created.seatCount;
}

/** Xoá sạch bảng app rồi seed lại — chạy lại bao nhiêu lần cũng ra cùng kết quả */
export async function seedDatabase(
  db: Db,
  deps: SeedDeps,
): Promise<SeedSummary> {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${APP_TABLES} RESTART IDENTITY CASCADE`),
  );
  // Giữ lại JSON vừa upload để snapshot ghế không phải tải lại geometry từ Blob
  const uploaded = new Map<string, string>();
  const recordingPut: PutJson = async (pathname, json) => {
    const result = await deps.putJson(pathname, json);
    uploaded.set(result.url, json);
    return result;
  };

  const versions = [];
  const geometries = new Map<SeedMapKey, { versionId: string; venue: Venue }>();
  for (const def of SEED_VENUES) {
    const version = await seedVenue(db, deps, def.key, recordingPut);
    const [row] = await db
      .select({ url: templateVersions.geometryUrl })
      .from(templateVersions)
      .where(eq(templateVersions.id, version.id));
    const venue = venueSchema.parse(
      JSON.parse(uploaded.get(row.url) ?? "null"),
    );
    versions.push(version);
    geometries.set(def.key, { versionId: version.id, venue });
  }

  let seats = 0;
  for (const event of SEED_EVENTS) {
    const geometry = geometries.get(event.venue);
    if (!geometry)
      throw new Error(`Thiếu template version cho map "${event.venue}"`);
    seats += await seedEvent(
      db,
      event,
      geometry.versionId,
      geometry.venue,
      deps,
    );
  }
  return {
    venues: SEED_VENUES.length,
    versions,
    events: SEED_EVENTS.length,
    seats,
  };
}
