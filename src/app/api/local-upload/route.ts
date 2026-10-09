// Local-mode replacement of /api/blob/upload: stores the image under public/local-blob.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isLocalBlobMode, writeLocalBlob } from "@/server/local-blob";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PATHNAME = /^(events|backgrounds)\/[\w.-]{1,100}$/;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** "events/a.png" -> "events/a-1f3c9a2b.png" so uploads never overwrite each other. */
function withRandomSuffix(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  const suffix = randomUUID().slice(0, 8);
  return dot > pathname.indexOf("/") + 1
    ? `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`
    : `${pathname}-${suffix}`;
}

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLocalBlobMode()) return new NextResponse(null, { status: 404 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid form data");
  }
  const pathname = form.get("pathname");
  const file = form.get("file");
  if (typeof pathname !== "string" || !ALLOWED_PATHNAME.test(pathname)) {
    return bad("Invalid upload path");
  }
  if (!(file instanceof File)) return bad("Missing file");
  if (!ALLOWED_TYPES.has(file.type))
    return bad("Only JPEG, PNG or WebP images");
  if (file.size > MAX_BYTES) return bad("Image is larger than 10 MB", 413);
  try {
    const { url } = await writeLocalBlob(
      withRandomSuffix(pathname),
      new Uint8Array(await file.arrayBuffer()),
    );
    return NextResponse.json({ url });
  } catch (cause) {
    console.error("local upload failed", cause);
    return bad("Upload failed", 500);
  }
}
