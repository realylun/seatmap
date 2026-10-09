// Thuật toán thuần (không phụ thuộc map): sinh row + ghế bên trong 1 polygon section.
// Port 1-1 từ seatgeek-study/seatmap-editor/geometry.js — giữ nguyên thứ tự phép tính để output
// trùng bit-for-bit với bản gốc (parity test).
// Ý tưởng: chọn 1 cạnh làm "cạnh trước" (phía sân khấu/sân). Các row là các đường song song
// với cạnh đó, lùi dần vào trong polygon; mỗi đường được cắt theo polygon rồi rải ghế đều.
import type { Point, Ring, SectionConfig } from "./types";

const EPS = 1e-9;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const length = (a: Point) => Math.hypot(a[0], a[1]);
const normalize = (a: Point) => scale(a, 1 / (length(a) || 1));
export const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

export type GeneratedRow = {
  readonly name: string;
  readonly line: [Point, Point] | null;
  readonly seats: readonly Point[];
};

type Frame = { p: Point; u: Point; n: Point; depth: number };

export function centroid(ring: Ring): Point {
  const pts = ring.slice(0, -1);
  const sum = pts.reduce<Point>((acc, p) => add(acc, p), [0, 0]);
  return scale(sum, 1 / pts.length);
}

// Tên row: "A".. bỏ qua các chữ trong skip (sân thật hay bỏ I, O); hoặc số "1"..
export function rowNames(
  start: string,
  count: number,
  skip: readonly string[] = [],
): string[] {
  const isNumeric = /^\d+$/.test(start);
  if (isNumeric)
    return Array.from({ length: count }, (_, i) => String(Number(start) + i));
  const skipSet = new Set(skip.map((s) => s.toUpperCase()));
  const names: string[] = [];
  let code = start.toUpperCase().charCodeAt(0);
  while (names.length < count) {
    const letter = String.fromCharCode(65 + ((code - 65) % 26));
    const repeat = Math.floor((code - 65) / 26) + 1; // sau Z → AA, BB...
    const name = letter.repeat(repeat);
    if (!skipSet.has(name)) names.push(name);
    code += 1;
  }
  return names;
}

// "A:12, B:14" → { A: 12, B: 14 }
export function parseOverrides(text = ""): Record<string, number> {
  return Object.fromEntries(
    text
      .split(",")
      .map((part) => part.split(":").map((s) => s.trim()))
      .filter(([k, v]) => k && Number(v) > 0)
      .map(([k, v]) => [k.toUpperCase(), Number(v)]),
  );
}

// Giao đường thẳng (origin + dir·t) với polygon → đoạn dài nhất nằm trong polygon
function clipLineToPolygon(
  origin: Point,
  dir: Point,
  ring: Ring,
): [number, number] | null {
  const ts: number[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const edge = sub(ring[i + 1], a);
    const denom = cross(dir, edge);
    const isParallel = Math.abs(denom) < EPS;
    if (isParallel) continue;
    const diff = sub(a, origin);
    const t = cross(diff, edge) / denom;
    const s = cross(diff, dir) / denom;
    const hitsEdge = s >= 0 && s < 1;
    if (hitsEdge) ts.push(t);
  }
  const sorted = ts.toSorted((x, y) => x - y);
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < sorted.length; i += 2)
    pairs.push([sorted[i], sorted[i + 1]]);
  if (pairs.length === 0) return null;
  return pairs.reduce((best, p) =>
    p[1] - p[0] > best[1] - best[0] ? p : best,
  );
}

function edgeIndex(ring: Ring, frontEdge: number): number {
  const edgeCount = ring.length - 1;
  return ((frontEdge % edgeCount) + edgeCount) % edgeCount;
}

function frontFrame(ring: Ring, frontEdge: number): Frame {
  const i = edgeIndex(ring, frontEdge);
  const p = ring[i];
  const u = normalize(sub(ring[i + 1], p));
  const candidate: Point = [-u[1], u[0]];
  const pointsInward = dot(sub(centroid(ring), p), candidate) > 0;
  const n = pointsInward ? candidate : scale(candidate, -1);
  const depth = Math.max(...ring.map((v) => dot(sub(v, p), n)));
  return { p, u, n, depth };
}

// Ray casting (even-odd). Ring đóng hay chưa đóng đều được
export function pointInRing([x, y]: Point, ring: Ring): boolean {
  const pts =
    ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])
      ? ring.slice(0, -1)
      : ring;
  return pts.reduce((inside, a, i) => {
    const b = pts[(i + 1) % pts.length];
    const crosses =
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    return crosses ? !inside : inside;
  }, false);
}

export function sectionDepth(ring: Ring, frontEdge: number): number {
  return frontFrame(ring, frontEdge).depth;
}

// Cạnh có trung điểm gần `target` nhất (vd. tâm sân) → làm cạnh trước, row A gần sân
export function nearestEdge(ring: Ring, target: Point): number {
  const mids = ring.slice(0, -1).map((p, i) => scale(add(p, ring[i + 1]), 0.5));
  const dists = mids.map((m) => length(sub(m, target)));
  return dists.indexOf(Math.min(...dists));
}

// Cạnh "quay mặt" về target: dài, vuông góc với hướng nhìn về target và ở gần target.
// Khác nearestEdge: dải ghế dài chạy vòng quanh sân có cạnh ngắn ở đầu dải đôi khi gần tâm hơn,
// nhưng row thật chạy dọc theo cạnh dài.
export function facingEdge(ring: Ring, target: Point): number {
  const scores = ring.slice(0, -1).map((p, i) => {
    const edge = sub(ring[i + 1], p);
    const toTarget = sub(target, scale(add(p, ring[i + 1]), 0.5));
    const facing = Math.abs(cross(normalize(edge), normalize(toTarget)));
    return (length(edge) * facing * facing) / (length(toTarget) || EPS);
  });
  return scores.indexOf(Math.max(...scores));
}

export function frontEdgeLine(ring: Ring, frontEdge: number): [Point, Point] {
  const i = edgeIndex(ring, frontEdge);
  return [ring[i], ring[i + 1]];
}

function buildRow(
  section: SectionConfig,
  frame: Frame,
  name: string,
  origin: Point,
  count: number | undefined,
): GeneratedRow {
  const span = clipLineToPolygon(origin, frame.u, section.ring);
  if (!span) return { name, line: null, seats: [] };
  const margin = section.seatSpacing / 2;
  const [t1, t2] = [span[0] + margin, span[1] - margin];
  const usable = Math.max(t2 - t1, 0);
  const auto = Math.max(1, Math.floor(usable / section.seatSpacing) + 1);
  const total = count ?? (section.seatsPerRow || auto);
  const step = total > 1 ? usable / (total - 1) : 0;
  const seats = Array.from({ length: total }, (_, k) =>
    add(origin, scale(frame.u, t1 + step * k)),
  );
  const ordered = section.numbering === "rtl" ? seats.toReversed() : seats;
  const line: [Point, Point] = [
    add(origin, scale(frame.u, span[0])),
    add(origin, scale(frame.u, span[1])),
  ];
  return { name, line, seats: ordered };
}

/**
 * seatsPerRow = 0 → tự tính theo seatSpacing. Override theo tên row ưu tiên cao nhất.
 */
export function generateRows(section: SectionConfig): GeneratedRow[] {
  const frame = frontFrame(section.ring, section.frontEdge);
  const names = rowNames(section.rowStart, section.rowCount, section.rowSkip);
  const overrides = parseOverrides(section.overrides);
  return names.map((name, i) => {
    const origin = add(
      frame.p,
      scale(frame.n, (frame.depth * (i + 0.5)) / names.length),
    );
    return buildRow(section, frame, name, origin, overrides[name]);
  });
}
