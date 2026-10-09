// MapLibre v6 mặc định tìm worker cạnh file bundle của nó (import.meta.url) — sau khi Turbopack
// bundle thì file đó không tồn tại ("Worker failed to load"). Trỏ thẳng tới worker của package;
// `new URL(..., import.meta.url)` để bundler copy file ra static asset.
import { setWorkerUrl } from "maplibre-gl";

/** Gọi 1 lần trước khi tạo map MapLibre đầu tiên */
export function configureMapLibreWorker() {
  setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
  );
}
