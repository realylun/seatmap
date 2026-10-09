// Local replacement for Vercel Blob (no token): files live under public/local-blob and are served by
// Next as static assets at /local-blob/<path>. Only used in local dev/seed.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export const LOCAL_BLOB_URL_PREFIX = "/local-blob/";
const SAFE_SEGMENT = /^[\w.-]{1,120}$/;
const MAX_PATH_LENGTH = 300;

export const isLocalBlobMode = () => !process.env.BLOB_READ_WRITE_TOKEN;

const rootDir = () =>
  resolve(
    process.env.LOCAL_BLOB_DIR ?? join(process.cwd(), "public/local-blob"),
  );

/** Safe relative path ("a/b.json") or null: no empty/dot segments, no traversal, no odd characters. */
export function sanitizeBlobPath(pathname: string): string | null {
  if (pathname.length === 0 || pathname.length > MAX_PATH_LENGTH) return null;
  const segments = pathname.split("/");
  const ok = segments.every(
    (s) => SAFE_SEGMENT.test(s) && s !== "." && s !== "..",
  );
  return ok ? segments.join("/") : null;
}

function resolveInside(pathname: string): { file: string; safe: string } {
  const safe = sanitizeBlobPath(pathname);
  if (!safe) throw new Error(`Invalid blob path: ${pathname}`);
  const root = rootDir();
  const file = resolve(root, safe);
  if (!file.startsWith(root + sep))
    throw new Error(`Invalid blob path: ${pathname}`);
  return { file, safe };
}

export async function writeLocalBlob(
  pathname: string,
  body: string | Uint8Array,
): Promise<{ url: string }> {
  const { file, safe } = resolveInside(pathname);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  return { url: `${LOCAL_BLOB_URL_PREFIX}${safe}` };
}

/** Reads a blob written by writeLocalBlob, from its "/local-blob/<path>" URL. */
export async function readLocalBlob(url: string): Promise<string> {
  const { file } = resolveInside(url.slice(LOCAL_BLOB_URL_PREFIX.length));
  return readFile(file, "utf8");
}

export const isLocalBlobUrl = (url: string) =>
  url.startsWith(LOCAL_BLOB_URL_PREFIX) &&
  sanitizeBlobPath(url.slice(LOCAL_BLOB_URL_PREFIX.length)) !== null;
