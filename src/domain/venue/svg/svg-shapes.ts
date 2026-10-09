// Hình học của từng phần tử SVG đã parse: outline → ring, ghế → tâm + bán kính.
// Mọi toạ độ ở đây là "toạ độ tài liệu": đã áp ma trận tích luỹ (transform + dời viewBox),
// chưa chiếu sang toạ độ map → kiểm tra ghế-trong-khu chính xác theo bản vẽ.
import type { Point } from "../types";
import type { SvgNode } from "./parse-svg";
import {
  applyMatrix,
  cleanRing,
  pathToRing,
  polygonToRing,
  rectToRing,
  type Result,
} from "./svg-geometry";

export type SvgIssue = {
  readonly level: "error" | "warning";
  readonly section: string | null;
  readonly element: string | null;
  readonly message: string;
};

export const OUTLINE_TAGS = new Set(["rect", "polygon", "path"]);
export const ROUND_TAGS = new Set(["circle", "ellipse"]);
export const SHAPE_TAGS = new Set([
  ...OUTLINE_TAGS,
  ...ROUND_TAGS,
  "polyline",
  "line",
]);

const ROUND_SEGMENTS = 32; // sân tròn / elip → polygon
const ELLIPSE_ROUNDNESS = 0.05; // |rx - ry| ≤ 5% → coi là tròn

const num = (node: SvgNode, key: string) => Number(node.attrs[key] ?? 0);

export const label = (node: SvgNode) =>
  node.id ? `#${node.id}` : `<${node.tag}>`;

export function issue(
  level: SvgIssue["level"],
  message: string,
  section: string | null = null,
  node: SvgNode | null = null,
): SvgIssue {
  return { level, section, element: node?.id ?? null, message };
}

function roundRing(node: SvgNode): Result<Point[]> {
  const [cx, cy] = [num(node, "cx"), num(node, "cy")];
  const [rx, ry] =
    node.tag === "circle"
      ? [num(node, "r"), num(node, "r")]
      : [num(node, "rx"), num(node, "ry")];
  if (!(rx > 0 && ry > 0))
    return { ok: false, error: `<${node.tag}> thiếu bán kính` };
  const points = Array.from({ length: ROUND_SEGMENTS }, (_, k): Point => {
    const angle = (2 * Math.PI * k) / ROUND_SEGMENTS;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
  return cleanRing(points);
}

function localRing(node: SvgNode, allowRound: boolean): Result<Point[]> {
  if (node.tag === "rect") return rectToRing(node.attrs);
  if (node.tag === "polygon") return polygonToRing(node.attrs.points ?? "");
  if (node.tag === "path") return pathToRing(node.attrs.d ?? "");
  if (allowRound && ROUND_TAGS.has(node.tag)) return roundRing(node);
  return {
    ok: false,
    error: `<${node.tag}> không dùng làm outline được — chỉ rect/polygon/path khép kín`,
  };
}

/** Outline (khu) hoặc vùng (sân, cho phép tròn) → ring toạ độ tài liệu */
export function docRing(
  node: SvgNode,
  { allowRound = false } = {},
): Result<Point[]> {
  const ring = localRing(node, allowRound);
  return ring.ok
    ? { ok: true, value: ring.value.map((p) => applyMatrix(node.matrix, p)) }
    : ring;
}

export type SeatShape = { readonly center: Point; readonly radius: number };

function localSeat(node: SvgNode): { c: Point; r: number } | string {
  if (node.tag === "circle")
    return { c: [num(node, "cx"), num(node, "cy")], r: num(node, "r") };
  if (node.tag === "rect") {
    const [w, h] = [num(node, "width"), num(node, "height")];
    return {
      c: [num(node, "x") + w / 2, num(node, "y") + h / 2],
      r: Math.min(w, h) / 2,
    };
  }
  if (node.tag === "ellipse") {
    const [rx, ry] = [num(node, "rx"), num(node, "ry")];
    const round = Math.abs(rx - ry) <= ELLIPSE_ROUNDNESS * Math.max(rx, ry);
    return round
      ? { c: [num(node, "cx"), num(node, "cy")], r: rx }
      : "ghế là ellipse dẹt — hãy dùng circle";
  }
  return `ghế phải là circle/ellipse/rect, không phải <${node.tag}>`;
}

/** Tâm + bán kính ghế ở toạ độ tài liệu, hoặc thông báo lỗi */
export function seatShape(node: SvgNode): SeatShape | string {
  const local = localSeat(node);
  if (typeof local === "string") return local;
  const center = applyMatrix(node.matrix, local.c);
  const edge = applyMatrix(node.matrix, [local.c[0] + local.r, local.c[1]]);
  return {
    center,
    radius: Math.hypot(edge[0] - center[0], edge[1] - center[1]),
  };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const k = Math.min(1, Math.max(0, t));
  return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
}

/** Khoảng cách tới cạnh gần nhất (reduce thay vì Math.min(...) → không giới hạn số cạnh) */
export const distanceToRing = (p: Point, ring: readonly Point[]) =>
  ring
    .slice(0, -1)
    .reduce(
      (best, a, i) => Math.min(best, distanceToSegment(p, a, ring[i + 1])),
      Infinity,
    );
