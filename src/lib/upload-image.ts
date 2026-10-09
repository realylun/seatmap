// Client-side image upload: Vercel Blob (client upload token) or, in local mode, our own route.
// NEXT_PUBLIC_BLOB_MODE=local is inlined at build time.
export async function uploadImage(
  pathname: string,
  file: File,
): Promise<string> {
  if (process.env.NEXT_PUBLIC_BLOB_MODE === "local") {
    const body = new FormData();
    body.set("pathname", pathname);
    body.set("file", file);
    const res = await fetch("/api/local-upload", { method: "POST", body });
    const json: { url?: unknown; error?: unknown } | null = await res
      .json()
      .catch(() => null);
    if (!res.ok || typeof json?.url !== "string") {
      throw new Error(
        typeof json?.error === "string" ? json.error : "Upload failed",
      );
    }
    return json.url;
  }
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
  });
  // The server adds a random suffix, so always use the returned URL
  return blob.url;
}
