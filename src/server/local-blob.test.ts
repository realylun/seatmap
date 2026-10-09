import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLocalBlobUrl,
  readLocalBlob,
  sanitizeBlobPath,
  writeLocalBlob,
} from "./local-blob";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sanitizeBlobPath", () => {
  it.each(["a/b.json", "events/x-1.png", "geometry/id/v1.json"])(
    "accepts %s",
    (p) => {
      expect(sanitizeBlobPath(p)).toBe(p);
    },
  );
  it.each([
    "",
    "../x",
    "a/../b",
    "/abs",
    "a//b",
    "a/./b",
    "a b",
    "a\\b",
    "x".repeat(301),
  ])("rejects %j", (p) => {
    expect(sanitizeBlobPath(p)).toBeNull();
  });
});

describe("local blob io", () => {
  it("round-trips a file and recognises its url", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lb-"));
    vi.stubEnv("LOCAL_BLOB_DIR", dir);
    const { url } = await writeLocalBlob(
      "events/a.bin",
      new Uint8Array([1, 2, 3]),
    );
    expect(url).toBe("/local-blob/events/a.bin");
    expect(isLocalBlobUrl(url)).toBe(true);
    expect([...(await readFile(join(dir, "events/a.bin")))]).toEqual([1, 2, 3]);
    await writeLocalBlob("geometry/g.json", "{}");
    expect(await readLocalBlob("/local-blob/geometry/g.json")).toBe("{}");
  });

  it("rejects traversal urls", async () => {
    expect(isLocalBlobUrl("/local-blob/../etc/passwd")).toBe(false);
    expect(isLocalBlobUrl("/elsewhere/a.png")).toBe(false);
    await expect(readLocalBlob("/local-blob/../x")).rejects.toThrow(
      "Invalid blob path",
    );
  });
});
