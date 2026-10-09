// Keep in sync with images.remotePatterns in next.config.ts.
const OPTIMIZABLE_HOST =
  /^([a-z0-9-]+\.public\.blob\.vercel-storage\.com|picsum\.photos|fastly\.picsum\.photos)$/i;

/** True when next/image may optimize the URL (local path or configured Blob or picsum host). */
export function isOptimizableImage(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && OPTIMIZABLE_HOST.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}
