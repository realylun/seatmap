// Text SVG → cây node thuần (không DOM, chạy được cả browser lẫn vitest/node).
// Mỗi node mang ma trận tích luỹ (đã gồm dời viewBox về gốc 0,0) và data đã kế thừa từ cha:
// data-* tường minh, hoặc suy ra từ id (Figma/Illustrator không xuất data-* → đặt tên layer
// sec-311 > row-A > seat-12).
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  multiply,
  parseTransform,
  type Matrix,
  type Result,
} from "./svg-geometry";

export type SvgData = Readonly<Record<string, string>>;

export type SvgNode = {
  readonly tag: string;
  readonly id: string | null;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: SvgData;
  readonly matrix: Matrix;
  readonly children: readonly SvgNode[];
};

export type ViewBox = {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
};

export type SvgDoc = { readonly viewBox: ViewBox; readonly root: SvgNode };

// Không vẽ ra màn hình → không thể là khu/ghế
const SKIPPED_TAGS = new Set([
  "defs",
  "clipPath",
  "mask",
  "symbol",
  "style",
  "script",
  "metadata",
  "title",
  "desc",
  "pattern",
  "linearGradient",
  "radialGradient",
  "marker",
  "filter",
]);

const ATTRS_KEY = ":@";
const DATA_PREFIX = "data-";

// Hậu tố chống trùng tên: Figma "row-A_2", Illustrator "seat-12_3_"
const DEDUPE_SUFFIX = /_\d+_?$/;

const ID_PATTERNS: readonly (readonly [
  RegExp,
  (m: RegExpMatchArray) => SvgData,
])[] = [
  [/^sec-(.+)$/, (m) => ({ section: m[1] })],
  [/^row-(.+)$/, (m) => ({ row: m[1] })],
  [/^seat-(\d+)$/, (m) => ({ seat: m[1] })],
  [/^(outline|label)$/, (m) => ({ role: m[1] })],
  [/^(field|stage)$/, (m) => ({ kind: m[1] })],
];

/** id layer → data ngữ nghĩa ({} nếu id không theo quy ước) */
export function idData(id: string): SvgData {
  const name = id.replace(DEDUPE_SUFFIX, "");
  for (const [pattern, toData] of ID_PATTERNS) {
    const match = name.match(pattern);
    if (match) return toData(match);
  }
  return {};
}

const ownData = (attrs: Readonly<Record<string, string>>): SvgData =>
  Object.fromEntries(
    Object.entries(attrs)
      .filter(([key]) => key.startsWith(DATA_PREFIX))
      .map(([key, value]) => [key.slice(DATA_PREFIX.length), value.trim()]),
  );

const isHidden = (attrs: Readonly<Record<string, string>>) =>
  attrs.display?.trim() === "none" ||
  /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/.test(attrs.style ?? "");

type RawNode = Record<string, unknown>;

const tagOf = (raw: RawNode) =>
  Object.keys(raw).find((key) => key !== ATTRS_KEY) ?? "";

const attrsOf = (raw: RawNode): Record<string, string> => {
  const attrs = raw[ATTRS_KEY];
  return typeof attrs === "object" && attrs !== null
    ? Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)]))
    : {};
};

const childrenOf = (raw: RawNode): RawNode[] => {
  const children = raw[tagOf(raw)];
  return Array.isArray(children)
    ? children.filter(
        (c): c is RawNode =>
          typeof c === "object" && c !== null && !("#text" in c),
      )
    : [];
};

function buildNode(
  raw: RawNode,
  parent: { data: SvgData; matrix: Matrix },
): Result<SvgNode | null> {
  const tag = tagOf(raw);
  const attrs = attrsOf(raw);
  if (SKIPPED_TAGS.has(tag) || isHidden(attrs))
    return { ok: true, value: null };
  const id = attrs.id ?? null;
  const transform = parseTransform(attrs.transform);
  if (!transform.ok)
    return { ok: false, error: `${transform.error} (phần tử #${id ?? tag})` };
  const data = { ...parent.data, ...(id ? idData(id) : {}), ...ownData(attrs) };
  const matrix = multiply(parent.matrix, transform.value);
  const children: SvgNode[] = [];
  for (const child of childrenOf(raw)) {
    const built = buildNode(child, { data, matrix });
    if (!built.ok) return built;
    if (built.value) children.push(built.value);
  }
  return { ok: true, value: { tag, id, attrs, data, matrix, children } };
}

const length = (value: string | undefined) =>
  Number((value ?? "").trim().replace(/px$/, ""));

function readViewBox(attrs: Readonly<Record<string, string>>): ViewBox | null {
  const parts = (attrs.viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [minX, minY, width, height] =
    parts.length === 4
      ? parts
      : [0, 0, length(attrs.width), length(attrs.height)];
  const valid =
    [minX, minY, width, height].every(Number.isFinite) &&
    width > 0 &&
    height > 0;
  return valid ? { minX, minY, width, height } : null;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  // SVG không cần entity DTD; vẫn decode &amp;… nhưng chặn cứng việc nở entity (billion laughs)
  processEntities: {
    enabled: true,
    maxEntityCount: 50,
    maxTotalExpansions: 1000,
    maxExpandedLength: 100_000,
  },
});

function safeParse(text: string): unknown {
  try {
    return parser.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export function parseSvg(text: string): Result<SvgDoc> {
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    const { msg, line } = validation.err;
    return { ok: false, error: `File SVG hỏng (dòng ${line}): ${msg}` };
  }
  const nodes = safeParse(text);
  if (nodes instanceof Error)
    return { ok: false, error: `Không đọc được SVG: ${nodes.message}` };
  const rawRoot = Array.isArray(nodes)
    ? nodes.find(
        (n): n is RawNode =>
          typeof n === "object" && n !== null && tagOf(n) === "svg",
      )
    : undefined;
  if (!rawRoot) return { ok: false, error: "File không có thẻ <svg> gốc" };
  const viewBox = readViewBox(attrsOf(rawRoot));
  if (!viewBox)
    return { ok: false, error: "SVG thiếu viewBox (hoặc width/height) hợp lệ" };
  const origin: Matrix = [1, 0, 0, 1, -viewBox.minX, -viewBox.minY];
  const root = buildNode(rawRoot, {
    data: {},
    matrix: origin,
  });
  if (!root.ok) return root;
  if (!root.value) return { ok: false, error: "Thẻ <svg> gốc bị ẩn" };
  return { ok: true, value: { viewBox, root: root.value } };
}

/** Duyệt cây theo thứ tự tài liệu (node trước, con sau) */
export function flatten(node: SvgNode): SvgNode[] {
  return [node, ...node.children.flatMap(flatten)];
}
