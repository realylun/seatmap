// Pixel ảnh nền ↔ toạ độ map. Ảnh phủ khung ±w/±h "độ" và raster source của MapLibre nội suy
// tuyến tính trong không gian Mercator → phải đổi pixel qua Mercator (giống tools/pipeline/project.mjs,
// thay cho mapboxgl.MercatorCoordinate của bản gốc).
import type { Extent, Point } from "@/domain/venue/types";

/** Ảnh được đặt trong khung toạ độ cao ±20 → zoom / switch level dùng chung giữa các venue */
export const IMAGE_HALF_HEIGHT = 20;

const mercX = (lng: number) => lng / 360 + 0.5;
const mercY = (lat: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const latFromMercY = (y: number) =>
  (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - Math.PI / 2) *
  (180 / Math.PI);

export function extentForImage(width: number, height: number): Extent {
  return { w: (IMAGE_HALF_HEIGHT * width) / height, h: IMAGE_HALF_HEIGHT };
}

/** Góc ảnh cho ImageSource: trên-trái, trên-phải, dưới-phải, dưới-trái */
export function imageCorners({ w, h }: Extent): [Point, Point, Point, Point] {
  return [
    [-w, h],
    [w, h],
    [w, -h],
    [-w, -h],
  ];
}

export function pixelProjector(
  extent: Extent,
  width: number,
  height: number,
): (pixel: Point) => Point {
  const [left, top] = [mercX(-extent.w), mercY(extent.h)];
  const [right, bottom] = [mercX(extent.w), mercY(-extent.h)];
  return ([px, py]) => {
    const x = left + (right - left) * (px / width);
    const y = top + (bottom - top) * (py / height);
    return [(x - 0.5) * 360, latFromMercY(y)];
  };
}
