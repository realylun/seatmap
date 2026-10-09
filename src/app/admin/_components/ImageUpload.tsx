"use client";

import { uploadImage } from "@/lib/upload-image";
import { useState } from "react";
import { inputCls } from "./ui";

const safeName = (name: string) => name.replace(/[^\w.-]+/g, "-").slice(-100);

/** Uploads an image straight to Vercel Blob and exposes its URL as a form field. */
export function ImageUpload({ name }: { name: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setUrl(await uploadImage(`events/${safeName(file.name)}`, file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={url} />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={inputCls}
        onChange={(e) => onChange(e.target.files?.[0])}
      />
      {busy && <p className="text-xs text-zinc-500">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Event"
          className="h-24 w-auto rounded object-cover"
        />
      )}
    </div>
  );
}
