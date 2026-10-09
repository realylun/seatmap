import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() =>
  vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })),
);
vi.mock("@vercel/blob", () => ({ put }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("putJson", () => {
  it("uploads public JSON to a stable path with the store token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "tok");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    const { putJson } = await import("./blob");
    await expect(putJson("geometry/a/v1.json", "{}")).resolves.toEqual({
      url: "https://blob.test/geometry/a/v1.json",
    });
    expect(put).toHaveBeenCalledWith(
      "geometry/a/v1.json",
      "{}",
      expect.objectContaining({
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
        token: "tok",
      }),
    );
  });

  it("writes under public/local-blob without a token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "local-blob-"));
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("LOCAL_BLOB_DIR", dir);
    const { putJson } = await import("./blob");
    const { url } = await putJson("geometry/a/v1.json", '{"a":1}');
    expect(url).toBe("/local-blob/geometry/a/v1.json");
    expect(await readFile(join(dir, "geometry/a/v1.json"), "utf8")).toBe(
      '{"a":1}',
    );
    await expect(putJson("../escape.json", "x")).rejects.toThrow(
      "Invalid blob path",
    );
  });
});
