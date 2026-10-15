import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { templateVersions } from "@/db/schema";
import {
  sectionChunkSchema,
  venueOverviewSchema,
} from "@/domain/venue/overview";
import { chunkSeatFeatures } from "@/domain/venue/split";
import type { SectionConfig, Venue } from "@/domain/venue/types";
import {
  DEFAULT_EXTENT,
  buildVenue,
  exportFile,
} from "@/domain/venue/venue-file";
import { createTestDb } from "@/test/pglite";
import type { PutJson } from "../blob";
import {
  GEOMETRY_CACHE_MAX_AGE,
  backfillOverviews,
  uploadSplitGeometry,
  versionDir,
} from "./geometry-split";
import { createTemplate, publishVersion } from "./templates";
import { createVenue } from "./venues";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

const section = (id: string, x: number): SectionConfig => ({
  id,
  ring: [
    [x, 0],
    [x + 4, 0],
    [x + 4, 3],
    [x, 3],
    [x, 0],
  ],
  frontEdge: 0,
  rowStart: "A",
  rowCount: 2,
  rowSkip: [],
  seatsPerRow: 3,
  overrides: "",
  seatSpacing: 0.5,
  numbering: "ltr",
});

const editor = {
  extent: DEFAULT_EXTENT,
  sections: [section("101", 0), section("102", 6), section("103", 12)],
};
const venue = buildVenue(editor);

/** Blob giả: giữ nội dung theo pathname, URL tuyệt đối như Vercel Blob */
function fakeBlob() {
  const files = new Map<string, string>();
  const put = vi.fn<PutJson>(async (path, json) => {
    files.set(path, json);
    return { url: `https://blob.test/${path}` };
  });
  return { files, put };
}

const pathOf = (url: string) => url.replace("https://blob.test/", "");

describe("uploadSplitGeometry", () => {
  it("uploads the overview and one chunk per section next to it", async () => {
    const { files, put } = fakeBlob();
    const url = await uploadSplitGeometry(put, "geometry/t1/v3", venue);
    expect(url).toBe("https://blob.test/geometry/t1/v3/overview.json");
    expect([...files.keys()].toSorted()).toEqual([
      "geometry/t1/v3/overview.json",
      "geometry/t1/v3/s/0.json",
      "geometry/t1/v3/s/1.json",
      "geometry/t1/v3/s/2.json",
    ]);
    const overview = venueOverviewSchema.parse(
      JSON.parse(files.get("geometry/t1/v3/overview.json") ?? ""),
    );
    // chunk path trong overview resolve (như client) ra đúng file đã upload
    const seats = overview.sections.flatMap((s) => {
      const chunkUrl = new URL(s.chunk, url).href;
      const json = files.get(pathOf(chunkUrl)) ?? "";
      return chunkSeatFeatures(sectionChunkSchema.parse(JSON.parse(json)));
    });
    expect(seats).toEqual(venue.geojson.seats.features);
  });

  it("marks every upload as long-lived (paths are versioned)", async () => {
    const { put } = fakeBlob();
    await uploadSplitGeometry(put, "geometry/t1/v1", venue);
    for (const call of put.mock.calls) {
      expect(call[2]).toEqual({ cacheControlMaxAge: GEOMETRY_CACHE_MAX_AGE });
    }
  });

  it("uploads the overview only after every chunk is in place", async () => {
    const { put } = fakeBlob();
    await uploadSplitGeometry(put, "geometry/t1/v1", venue);
    expect(put.mock.calls.at(-1)?.[0]).toBe("geometry/t1/v1/overview.json");
  });

  it("limits how many chunks upload at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const put = vi.fn<PutJson>(async (path) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { url: `https://blob.test/${path}` };
    });
    const many = buildVenue({
      extent: DEFAULT_EXTENT,
      sections: Array.from({ length: 20 }, (_, i) =>
        section(String(i), (i % 5) * 5),
      ),
    });
    await uploadSplitGeometry(put, "geometry/t1/v1", many);
    expect(put).toHaveBeenCalledTimes(21);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("stops starting new uploads after the first chunk fails", async () => {
    const started: string[] = [];
    const put = vi.fn<PutJson>(async (path) => {
      started.push(path);
      await new Promise((r) => setTimeout(r, 1));
      if (path.endsWith("s/0.json")) throw new Error("blob down");
      return { url: `https://blob.test/${path}` };
    });
    const many = buildVenue({
      extent: DEFAULT_EXTENT,
      sections: Array.from({ length: 40 }, (_, i) =>
        section(String(i), (i % 5) * 5),
      ),
    });
    await expect(
      uploadSplitGeometry(put, "geometry/t1/v1", many),
    ).rejects.toThrow("blob down");
    await new Promise((r) => setTimeout(r, 20));
    // chỉ các upload đã chạy cùng lúc với chunk lỗi (≤ 8 + vòng kế của mỗi worker)
    expect(started.length).toBeLessThan(17);
  });

  it("fails when a chunk upload fails, without uploading the overview", async () => {
    const put = vi.fn<PutJson>(async (path) => {
      if (path.endsWith("s/1.json")) throw new Error("blob down");
      return { url: `https://blob.test/${path}` };
    });
    await expect(
      uploadSplitGeometry(put, "geometry/t1/v1", venue),
    ).rejects.toThrow("blob down");
    expect(put.mock.calls.map((c) => c[0])).not.toContain(
      "geometry/t1/v1/overview.json",
    );
  });
});

async function setupTemplate(name: string) {
  const v = await createVenue(ctx.db, { name, city: "HCMC" });
  if (!v.ok) throw new Error(v.error);
  const tpl = await createTemplate(ctx.db, {
    venueId: v.value,
    name,
    venueJson: exportFile({ ...editor, objects: [] }),
  });
  if (!tpl.ok) throw new Error(tpl.error);
  return tpl.value;
}

describe("publishVersion with split geometry", () => {
  it("records the overview url of the published version", async () => {
    const templateId = await setupTemplate("Split");
    const { files, put } = fakeBlob();
    const res = await publishVersion(ctx.db, put, templateId);
    if (!res.ok) throw new Error(res.error);
    const [row] = await ctx.db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, res.value.id));
    expect(row.geometryUrl).toBe(
      `https://blob.test/geometry/${templateId}/v1.json`,
    );
    // thư mục có hậu tố ngẫu nhiên: 2 lần publish cùng lúc (cùng số version) không ghi đè chunk
    // của nhau, vì chunk được cache 1 năm
    const dir = new RegExp(
      `^https://blob\\.test/geometry/${templateId}/v1-[\\w-]{8}/overview\\.json$`,
    );
    expect(row.overviewUrl).toMatch(dir);
    const overview = venueOverviewSchema.parse(
      JSON.parse(files.get(pathOf(row.overviewUrl ?? "")) ?? ""),
    );
    expect(overview.sections).toHaveLength(3);
    expect(overview.seatSpacing).toBeGreaterThan(0);
    for (const call of put.mock.calls) {
      expect(call[2]).toEqual({ cacheControlMaxAge: GEOMETRY_CACHE_MAX_AGE });
    }
  });

  it("uploads two publishes of the same version to different folders", async () => {
    const templateId = await setupTemplate("Twice");
    const first = fakeBlob();
    const second = fakeBlob();
    const a = await uploadSplitGeometry(
      first.put,
      versionDir(templateId, 1),
      venue,
    );
    const b = await uploadSplitGeometry(
      second.put,
      versionDir(templateId, 1),
      venue,
    );
    expect(a).not.toBe(b);
  });

  it("records no version when a chunk upload fails", async () => {
    const templateId = await setupTemplate("Broken");
    const put = vi.fn<PutJson>(async (path) => {
      if (path.includes("/s/")) throw new Error("blob down");
      return { url: `https://blob.test/${path}` };
    });
    await expect(publishVersion(ctx.db, put, templateId)).rejects.toThrow(
      "blob down",
    );
    const rows = await ctx.db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId));
    expect(rows).toHaveLength(0);
  });
});

async function legacyVersion(name: string) {
  const templateId = await setupTemplate(name);
  const published = await publishVersion(ctx.db, fakeBlob().put, templateId);
  if (!published.ok) throw new Error(published.error);
  await ctx.db
    .update(templateVersions)
    .set({ overviewUrl: null })
    .where(eq(templateVersions.id, published.value.id));
  return { templateId, versionId: published.value.id };
}

const overviewOf = async (versionId: string) => {
  const [row] = await ctx.db
    .select({ url: templateVersions.overviewUrl })
    .from(templateVersions)
    .where(eq(templateVersions.id, versionId));
  return row.url;
};

describe("backfillOverviews", () => {
  it("splits versions published before overviews existed, once", async () => {
    const { templateId, versionId } = await legacyVersion("Legacy");
    const legacy = fakeBlob();
    const load = vi.fn(async (): Promise<Venue> => venue);
    const first = await backfillOverviews(ctx.db, legacy.put, load);
    expect(first.failed).toEqual([]);
    expect(first.updated).toContain(versionId);
    expect(load).toHaveBeenCalledWith(
      `https://blob.test/geometry/${templateId}/v1.json`,
    );
    expect(await overviewOf(versionId)).toMatch(
      new RegExp(`/geometry/${templateId}/v1-[\\w-]{8}/overview\\.json$`),
    );

    const again = await backfillOverviews(ctx.db, legacy.put, load);
    expect(again).toEqual({ updated: [], failed: [] });
  });

  it("keeps going past a version that cannot be loaded", async () => {
    const broken = await legacyVersion("Broken geometry");
    const fine = await legacyVersion("Fine geometry");
    const load = vi.fn(async (url: string): Promise<Venue> => {
      if (url.includes(broken.templateId)) throw new Error("404");
      return venue;
    });
    const res = await backfillOverviews(ctx.db, fakeBlob().put, load);
    expect(res.updated).toContain(fine.versionId);
    expect(res.failed).toEqual([
      { id: broken.versionId, error: expect.stringContaining("404") },
    ]);
    expect(await overviewOf(fine.versionId)).not.toBeNull();
    expect(await overviewOf(broken.versionId)).toBeNull();
  });
});
