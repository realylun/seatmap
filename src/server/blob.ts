import { put } from "@vercel/blob";
import { env } from "@/lib/env";
import { isLocalBlobMode, writeLocalBlob } from "./local-blob";

export type PutOptions = {
  /** Seconds browsers / CDN may cache the blob; only for immutable (versioned) paths */
  readonly cacheControlMaxAge?: number;
};

/** Uploads a JSON document to a stable, public path. Injectable for tests. */
export type PutJson = (
  pathname: string,
  json: string,
  options?: PutOptions,
) => Promise<{ url: string }>;

/** Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise public/local-blob (root-relative URL). */
export async function putFile(
  pathname: string,
  body: string | Buffer,
  contentType: string,
  options: PutOptions = {},
): Promise<{ url: string }> {
  if (isLocalBlobMode()) return writeLocalBlob(pathname, body);
  const blob = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: env.blobToken,
    ...options,
  });
  return { url: blob.url };
}

export const putJson: PutJson = (pathname, json, options) =>
  putFile(pathname, json, "application/json", options);
