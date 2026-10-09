// Hình học SVG thuần (không DOM): transform → ma trận affine, outline (path/rect/polygon) → ring.
// Chỉ nhận đường thẳng: outline khu phải là cạnh thẳng / bậc thang, curve bị từ chối để
// polygon khớp đúng bản vẽ thay vì bị xấp xỉ.
import type { Point } from "../types";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** [a, b, c, d, e, f] theo chuẩn SVG: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const success = <T>(value: T): Result<T> => ({ ok: true, value });
const failure = <T>(error: string): Result<T> => ({ ok: false, error });

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const EPS = 1e-9;

/** m · n — n áp trước (vd. parent · child) */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const numbers = (text: string) => (text.match(NUMBER) ?? []).map(Number);

function transformFn(name: string, args: readonly number[]): Matrix | null {
  const n = args.length;
  if (name === "matrix" && n === 6) {
    const [a, b, c, d, e, f] = args;
    return [a, b, c, d, e, f];
  }
  if (name === "translate" && (n === 1 || n === 2))
    return [1, 0, 0, 1, args[0], args[1] ?? 0];
  if (name === "scale" && (n === 1 || n === 2))
    return [args[0], 0, 0, args[1] ?? args[0], 0, 0];
  if (name === "rotate" && (n === 1 || n === 3)) {
    const rad = (args[0] * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
    const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
    if (n === 1) return rotation;
    const [cx, cy] = [args[1], args[2]];
    return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [
      1,
      0,
      0,
      1,
      -cx,
      -cy,
    ]);
  }
  if (name === "skewX" && n === 1)
    return [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0];
  if (name === "skewY" && n === 1)
    return [1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0];
  return null;
}

/** Thuộc tính transform → 1 ma trận. "A B" = A · B (B áp trước) */
export function parseTransform(text: string | undefined): Result<Matrix> {
  const source = (text ?? "").trim();
  const pattern = /\s*([a-zA-Z]+)\s*\(([^)]*)\)\s*,?/y;
  let matrix = IDENTITY;
  let consumed = 0;
  for (let m = pattern.exec(source); m; m = pattern.exec(source)) {
    const fn = transformFn(m[1], numbers(m[2]));
    if (!fn) return failure(`transform không hỗ trợ: "${m[0].trim()}"`);
    matrix = multiply(matrix, fn);
    consumed = pattern.lastIndex;
  }
  return consumed === source.length
    ? success(matrix)
    : failure(`transform không đọc được: "${source}"`);
}

const PATH_TOKEN = new RegExp(`[a-zA-Z]|${NUMBER.source}`, "g");
const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);

/** Path chỉ gồm M/L/H/V/Z (tuyệt đối + tương đối), đúng 1 subpath khép kín → ring đóng */
export function pathToRing(d: string): Result<Point[]> {
  const leftover = d.replace(PATH_TOKEN, "").replace(/[\s,]/g, "");
  if (leftover) return failure(`path có ký tự lạ: "${leftover}"`);
  const tokens = d.match(PATH_TOKEN) ?? [];
  const points: Point[] = [];
  let cmd = "";
  let closed = false;
  let i = 0;
  const take = () => Number(tokens[i++]);
  const hasNumber = () => i < tokens.length && !isCommand(tokens[i]);
  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    else if (!cmd) return failure("path phải bắt đầu bằng M");
    if (closed) return failure("path có nhiều subpath — mỗi khu chỉ 1 outline");
    const [x, y] = points.at(-1) ?? [0, 0];
    const relative = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    if (upper === "Z") {
      closed = true;
      continue;
    }
    if (!"MLHV".includes(upper))
      return failure(
        `path dùng lệnh "${cmd}" — outline chỉ được dùng đoạn thẳng (M/L/H/V/Z)`,
      );
    if (upper === "M" && points.length > 0)
      return failure("path có nhiều subpath — mỗi khu chỉ 1 outline");
    const arity = upper === "H" || upper === "V" ? 1 : 2;
    const args = Array.from({ length: arity }, () =>
      hasNumber() ? take() : NaN,
    );
    if (args.some(Number.isNaN)) return failure(`lệnh "${cmd}" thiếu toạ độ`);
    const base = relative ? [x, y] : [0, 0];
    const next: Point =
      upper === "H"
        ? [base[0] + args[0], y]
        : upper === "V"
          ? [x, base[1] + args[0]]
          : [base[0] + args[0], base[1] + args[1]];
    points.push(next);
    // toạ độ thừa sau M/m là lineto ngầm (L/l)
    if (upper === "M") cmd = relative ? "l" : "L";
  }
  if (!closed) return failure("path chưa khép kín (thiếu Z)");
  return cleanRing(points);
}

const attrNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value.trim().replace(/px$/, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function rectToRing(
  attrs: Readonly<Record<string, string | undefined>>,
): Result<Point[]> {
  const [x, y] = [attrNumber(attrs.x, 0), attrNumber(attrs.y, 0)];
  const [w, h] = [attrNumber(attrs.width, NaN), attrNumber(attrs.height, NaN)];
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0)
    return failure("rect thiếu hoặc sai x/y/width/height");
  return cleanRing([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

export function polygonToRing(points: string): Result<Point[]> {
  const values = numbers(points);
  if (values.length % 2 !== 0) return failure("polygon có số toạ độ lẻ");
  const pts = Array.from({ length: values.length / 2 }, (_, k): Point => [
    values[2 * k],
    values[2 * k + 1],
  ]);
  return cleanRing(pts);
}

const samePoint = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS;

function isCollinear(a: Point, b: Point, c: Point): boolean {
  const [ux, uy] = [b[0] - a[0], b[1] - a[1]];
  const [vx, vy] = [c[0] - b[0], c[1] - b[1]];
  const cross = ux * vy - uy * vx;
  return Math.abs(cross) <= EPS * Math.hypot(ux, uy) * Math.hypot(vx, vy);
}

/** Bỏ điểm trùng liên tiếp + điểm thẳng hàng (cạnh bậc thang sạch), trả ring đóng mới */
export function cleanRing(points: readonly Point[]): Result<Point[]> {
  const deduped = points.filter(
    (p, i) => i === 0 || !samePoint(p, points[i - 1]),
  );
  const open =
    deduped.length > 1 && samePoint(deduped[0], deduped.at(-1) ?? deduped[0])
      ? deduped.slice(0, -1)
      : deduped;
  let ring = open;
  for (let changed = true; changed && ring.length >= 3;) {
    const current = ring;
    ring = current.filter(
      (p, i) =>
        !isCollinear(
          current[(i - 1 + current.length) % current.length],
          p,
          current[(i + 1) % current.length],
        ),
    );
    changed = ring.length !== current.length;
  }
  if (ring.length < 3) return failure("outline có ít hơn 3 đỉnh phân biệt");
  return success([
    ...ring.map((p): Point => [p[0], p[1]]),
    [ring[0][0], ring[0][1]],
  ]);
}
