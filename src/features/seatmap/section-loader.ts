// Chọn section cần tải chunk ghế (tải theo tầng): section trong khung nhìn khi đã zoom gần, cộng các
// section "ghim" (đang chọn / bay tới) ở mọi mức zoom để ghế sẵn sàng khi camera tới nơi.
import type { Point } from "@/domain/venue/types";
import { SWITCH_LEVEL } from "./build-style";

/** Tải từ mức row (sớm hơn ngưỡng hiện ghế SEAT_LEVEL - 0.4) để ghế có sẵn trước khi cần vẽ */
export const LOAD_FROM_ZOOM = SWITCH_LEVEL;
/** Nới khung nhìn mỗi bên bấy nhiêu (tỉ lệ) để tải trước section sắp lọt vào khi kéo map */
const VIEW_MARGIN = 0.25;
/** Nghiêng quá mức này thì khung nhìn đã kéo tới chân trời, không nới thêm */
const TILTED_PITCH = 30;

type Bounds = readonly [Point, Point];

export type LoaderSection = { readonly id: string; readonly bounds: Bounds };
export type LoaderView = {
  readonly zoom: number;
  /** Khung bao vùng nhìn thấy (map nghiêng thì kéo dài về phía chân trời) */
  readonly bounds: Bounds;
  /** Tâm camera: section gần đây được tải trước */
  readonly center: Point;
  readonly pitch: number;
  /** Camera đang bay / kéo: khung nhìn chỉ là tạm thời */
  readonly moving: boolean;
};

function expand([[minX, minY], [maxX, maxY]]: Bounds, ratio: number): Bounds {
  const dx = (maxX - minX) * ratio;
  const dy = (maxY - minY) * ratio;
  return [
    [minX - dx, minY - dy],
    [maxX + dx, maxY + dy],
  ];
}

const intersects = (a: Bounds, b: Bounds) =>
  a[0][0] <= b[1][0] &&
  b[0][0] <= a[1][0] &&
  a[0][1] <= b[1][1] &&
  b[0][1] <= a[1][1];

const middle = ([[minX, minY], [maxX, maxY]]: Bounds): Point => [
  (minX + maxX) / 2,
  (minY + maxY) / 2,
];

const isNear = (view: LoaderView) => view.zoom >= LOAD_FROM_ZOOM;

function inView(
  view: LoaderView,
  sections: readonly LoaderSection[],
): LoaderSection[] {
  if (!isNear(view) || view.moving) return [];
  const margin = view.pitch > TILTED_PITCH ? 0 : VIEW_MARGIN;
  const area = expand(view.bounds, margin);
  const [cx, cy] = view.center;
  const distance = (s: LoaderSection) => {
    const [x, y] = middle(s.bounds);
    return Math.hypot(x - cx, y - cy);
  };
  return sections
    .filter((s) => intersects(s.bounds, area))
    .toSorted((a, b) => distance(a) - distance(b));
}

/**
 * Id section cần tải theo thứ tự ưu tiên: ghim trước, rồi section đang hover (chỉ khi đã zoom gần —
 * rê chuột qua map toàn sân không kéo chunk về), rồi section trong khung nhìn gần tâm camera trước.
 */
export function sectionsToLoad(
  view: LoaderView,
  sections: readonly LoaderSection[],
  skip: ReadonlySet<string>,
  pinned: readonly (string | null)[],
  hovered: string | null = null,
): string[] {
  const known = new Set(sections.map((s) => s.id));
  const ids = [
    ...pinned,
    isNear(view) ? hovered : null,
    ...inView(view, sections).map((s) => s.id),
  ];
  const wanted = ids.filter(
    (id): id is string => id !== null && known.has(id) && !skip.has(id),
  );
  return [...new Set(wanted)];
}
