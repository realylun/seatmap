import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PATHNAME = /^(events|backgrounds)\/[\w.-]{1,100}$/;
// No SVG: it can carry scripts
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const json = await handleUpload({
      body,
      request,
      token: env.blobToken,
      onBeforeGenerateToken: async (pathname) => {
        if (!ALLOWED_PATHNAME.test(pathname))
          throw new Error("Invalid upload path");
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (cause) {
    console.error("blob upload token failed", cause);
    return NextResponse.json({ error: "Upload not allowed" }, { status: 400 });
  }
}
