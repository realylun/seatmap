import {
  detectDarkObjects,
  detectSections,
  pointInRing,
  type DetectedShape,
  type ImageLike,
} from "../detect";
import type { Point } from "../types";

type Rgb = readonly [number, number, number];

export type RasterToSvgOptions = {
  readonly sectionColor?: Rgb;
  readonly colorTolerance: number;
  readonly minSolidity: number;
  readonly tiers: number;
  /** Ghi `data-seat-spacing` lên mọi khu (đơn vị map) — thiếu = mặc định của editor */
  readonly seatSpacing?: number;
};

export const RASTER_TO_SVG_DEFAULTS: RasterToSvgOptions = {
  colorTolerance: 22,
  minSolidity: 0.7,
  tiers: 10,
};

export type RasterSvg = {
  readonly svg: string;
  readonly sectionColor: Rgb;
  readonly sections: number;
  readonly stages: number;
  readonly dropped: {
    readonly color: number;
    readonly solidity: number;
    readonly insideStage: number;
  };
};

const luminance = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

export function dominantSectionColor(image: ImageLike): Rgb {
  const { data } = image;
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    const isCandidate = data[i + 3] > 200 && lum >= 150 && lum < 250;
    if (!isCandidate) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) throw new Error("Ảnh không có vùng màu khu ghế");
  const [best] = [...counts].reduce(
    (top, entry) => (entry[1] > top[1] ? entry : top),
    [0, -1],
  );
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

const colorAt = (image: ImageLike, [x, y]: Point): Rgb => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
};

const sampleOf = (shape: DetectedShape): Point => {
  const center: Point = [
    Math.round(shape.center[0]),
    Math.round(shape.center[1]),
  ];
  return pointInRing(center, shape.ring) ? center : shape.ring[0];
};

const colorDistance = (a: Rgb, b: Rgb) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const halfHull = (points: readonly Point[]) =>
  points.reduce<Point[]>((hull, p) => {
    const next = [...hull];
    while (
      next.length >= 2 &&
      cross(next[next.length - 2], next[next.length - 1], p) <= 0
    )
      next.pop();
    return [...next, p];
  }, []);

function convexHull(points: readonly Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = halfHull(sorted);
  const upper = halfHull(sorted.toReversed());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const polygonArea = (ring: readonly Point[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const solidity = (shape: DetectedShape) =>
  shape.area / Math.max(1, polygonArea(convexHull(shape.ring)) + 1);

const average = (points: readonly Point[]): Point =>
  points.reduce<Point>(
    ([x, y], p) => [x + p[0] / points.length, y + p[1] / points.length],
    [0, 0],
  );

type Named = { readonly name: string; readonly shape: DetectedShape };
function nameSections(
  shapes: readonly DetectedShape[],
  center: Point,
  tiers: number,
): Named[] {
  const [cx, cy] = center;
  const rx = Math.max(1, ...shapes.map((s) => Math.abs(s.center[0] - cx)));
  const ry = Math.max(1, ...shapes.map((s) => Math.abs(s.center[1] - cy)));
  const keyed = shapes.map((shape) => {
    const [dx, dy] = [shape.center[0] - cx, shape.center[1] - cy];
    const tier = Math.min(
      tiers - 1,
      Math.floor(Math.hypot(dx / rx, dy / ry) * tiers),
    );
    const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    return { shape, tier, angle };
  });
  const sorted = keyed.toSorted((a, b) => a.tier - b.tier || a.angle - b.angle);
  return sorted.map(({ shape, tier }, i) => {
    const index = sorted.slice(0, i).filter((k) => k.tier === tier).length + 1;
    return { name: `T${tier}-${String(index).padStart(3, "0")}`, shape };
  });
}
const openRing = (ring: readonly Point[]) => ring.slice(0, -1);

const pathData = (ring: readonly Point[]) =>
  `M${openRing(ring)
    .map(([x, y]) => `${x} ${y}`)
    .join(" L")} Z`;

const hex = (c: Rgb) =>
  `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function sectionGroup(
  { name, shape }: Named,
  fill: string,
  seatSpacing: number | undefined,
) {
  const [x, y] = shape.center.map((v) => Math.round(v));
  const spacing =
    seatSpacing === undefined ? "" : ` data-seat-spacing="${seatSpacing}"`;
  return [
    `  <g data-section="${name}"${spacing}>`,
    `    <path data-role="outline" d="${pathData(shape.ring)}" fill="${fill}" stroke="#aeadaf" stroke-width="0.5"/>`,
    `    <text data-role="label" x="${x}" y="${y}" font-size="4" text-anchor="middle">${name}</text>`,
    `  </g>`,
  ].join("\n");
}

const stagePolygon = (shape: DetectedShape) =>
  `    <polygon points="${openRing(shape.ring)
    .map((p) => p.join(","))
    .join(" ")}" fill="#4d4d4d"/>`;

export function rasterToSvg(
  image: ImageLike,
  options: Partial<RasterToSvgOptions> = {},
): RasterSvg {
  const opts = { ...RASTER_TO_SVG_DEFAULTS, ...options };
  if (
    opts.seatSpacing !== undefined &&
    !(Number.isFinite(opts.seatSpacing) && opts.seatSpacing > 0)
  )
    throw new Error("seatSpacing phải là số dương");
  const sectionColor = opts.sectionColor ?? dominantSectionColor(image);
  const stages = detectDarkObjects(image);
  const detected = detectSections(image);
  const byColor = detected.filter(
    (s) =>
      colorDistance(colorAt(image, sampleOf(s)), sectionColor) <=
      opts.colorTolerance,
  );
  const bySolidity = byColor.filter((s) => solidity(s) >= opts.minSolidity);
  const kept = bySolidity.filter(
    (s) => !stages.some((st) => pointInRing(s.center, st.ring)),
  );
  const center =
    stages.length > 0
      ? average(stages.map((s) => s.center))
      : average(kept.map((s) => s.center));
  const named = nameSections(kept, center, opts.tiers);
  const fill = hex(sectionColor);
  const stageBlock =
    stages.length > 0
      ? [`  <g id="stage">`, ...stages.map(stagePolygon), `  </g>`]
      : [];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${image.width} ${image.height}">`,
    ...stageBlock,
    ...named.map((n) => sectionGroup(n, fill, opts.seatSpacing)),
    `</svg>`,
    "",
  ].join("\n");
  return {
    svg,
    sectionColor,
    sections: named.length,
    stages: stages.length,
    dropped: {
      color: detected.length - byColor.length,
      solidity: byColor.length - bySolidity.length,
      insideStage: bySolidity.length - kept.length,
    },
  };
}
