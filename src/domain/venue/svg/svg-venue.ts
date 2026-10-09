// SVG theo quy chuẩn designer → section nháp (cùng dạng output với auto-detect ảnh nền) để nạp
// vào editor. Khu có ghế vẽ tay → explicitRows; không có → sinh row tự động từ data-*.
// Lỗi được gom hết (không dừng ở lỗi đầu) để designer sửa 1 lượt; có lỗi thì không trả section.
// Spec cho designer: docs/seatmap-svg-spec.md
import { centroid } from "../geometry";
import { extentForImage, pixelProjector } from "../projection";
import type { EditorBlock, Extent, Point, VenueObject } from "../types";
import { addSections, toEditorBlock, type SectionDraft } from "../venue-file";
import { flatten, parseSvg, type SvgNode } from "./parse-svg";
import {
  buildSection,
  findOutline,
  type SectionOutline,
  type ToMap,
} from "./svg-section";
import {
  docRing,
  issue,
  label,
  OUTLINE_TAGS,
  ROUND_TAGS,
  type SvgIssue,
} from "./svg-shapes";

export type { SvgIssue } from "./svg-shapes";

export type SvgImport = {
  readonly extent: Extent;
  readonly drafts: readonly SectionDraft[];
  readonly objects: readonly VenueObject[];
  readonly issues: readonly SvgIssue[];
};

const FIELD_KINDS = new Set(["field", "stage"]);
const EMPTY_EXTENT: Extent = { w: 1, h: 1 };

// 6 chữ số thập phân (≈ 1/170000 chiều cao venue) — đủ chính xác, giảm ~40% kích thước JSON
const PRECISION = 1e6;
const roundPoint = ([x, y]: Point): Point => [
  Math.round(x * PRECISION) / PRECISION,
  Math.round(y * PRECISION) / PRECISION,
];

const average = (points: readonly Point[]): Point =>
  points.reduce<Point>(
    ([x, y], p) => [x + p[0] / points.length, y + p[1] / points.length],
    [0, 0],
  );

const failure = (message: string): SvgImport => ({
  extent: EMPTY_EXTENT,
  drafts: [],
  objects: [],
  issues: [issue("error", message)],
});

/**
 * Sân / sân khấu: hình (kể cả trong group "field") ngoài các khu. Hình không đọc được chỉ cảnh
 * báo — sân chỉ dùng để hướng row A, không đáng chặn cả lần nhập.
 */
function readField(nodes: readonly SvgNode[], toMap: ToMap) {
  const fieldNodes = nodes.filter(
    (n) =>
      (OUTLINE_TAGS.has(n.tag) || ROUND_TAGS.has(n.tag)) &&
      FIELD_KINDS.has(n.data.kind ?? "") &&
      !n.data.section,
  );
  const read = fieldNodes.map((node) => ({
    node,
    ring: docRing(node, { allowRound: true }),
  }));
  const objects = read.flatMap(({ ring }) =>
    ring.ok ? [{ kind: "stage" as const, ring: ring.value.map(toMap) }] : [],
  );
  const issues = read.flatMap(({ node, ring }) =>
    ring.ok
      ? []
      : [
          issue(
            "warning",
            `Sân ${label(node)} bị bỏ qua: ${ring.error}`,
            null,
            node,
          ),
        ],
  );
  return { objects, issues };
}

function readSections(nodes: readonly SvgNode[]) {
  const ids = [
    ...new Set(nodes.flatMap((n) => (n.data.section ? [n.data.section] : []))),
  ];
  const found = ids.map((id) =>
    findOutline(
      id,
      nodes.filter((n) => n.data.section === id),
    ),
  );
  return {
    outlines: found.filter((f): f is SectionOutline => !("level" in f)),
    issues: [
      ...(ids.length === 0
        ? [
            issue(
              "error",
              "Không tìm thấy khu nào (data-section hoặc group sec-…)",
            ),
          ]
        : []),
      ...found.filter((f): f is SvgIssue => "level" in f),
    ],
  };
}

function unsupportedWarnings(nodes: readonly SvgNode[]): SvgIssue[] {
  const has = (tag: string) => nodes.some((n) => n.tag === tag);
  const warnings: [boolean, string][] = [
    [
      has("image"),
      "SVG có ảnh raster nhúng (<image>) — bị bỏ qua, chỉ dùng vector",
    ],
    [
      has("use"),
      "SVG có <use> — không hỗ trợ, hãy expand/ungroup trước khi export",
    ],
  ];
  return warnings.flatMap(([present, m]) =>
    present ? [issue("warning", m)] : [],
  );
}

export function svgToDrafts(text: string): SvgImport {
  const parsed = parseSvg(text);
  if (!parsed.ok) return failure(parsed.error);
  const { viewBox, root } = parsed.value;
  const extent = extentForImage(viewBox.width, viewBox.height);
  const project = pixelProjector(extent, viewBox.width, viewBox.height);
  const toMap: ToMap = (p) => roundPoint(project(p));
  const nodes = flatten(root);

  const field = readField(nodes, toMap);
  const sections = readSections(nodes);
  // Row A quay về tâm sân; không có sân → tâm các khu
  const venueCenter =
    field.objects.length > 0
      ? average(field.objects.map((o) => centroid(o.ring)))
      : average(sections.outlines.map((s) => centroid(s.ring.map(toMap))));
  const built = sections.outlines.map((s) =>
    buildSection(s, toMap, venueCenter),
  );
  const noField =
    field.objects.length === 0
      ? [
          issue(
            "warning",
            'Không có sân/sân khấu (id="field" hoặc id="stage") — row A quay về tâm các khu',
          ),
        ]
      : [];
  const issues = [
    ...sections.issues,
    ...built.flatMap((b) => b.issues),
    ...field.issues,
    ...noField,
    ...unsupportedWarnings(nodes),
  ];
  const hasError = issues.some((i) => i.level === "error");
  return {
    extent,
    drafts: hasError ? [] : built.flatMap((b) => (b.draft ? [b.draft] : [])),
    objects: hasError ? [] : field.objects,
    issues,
  };
}

/** Kết quả import SVG → block editor thay thế toàn bộ (id khu duy nhất qua addSections) */
export function blockFromSvg(
  svg: Pick<SvgImport, "extent" | "drafts" | "objects">,
): EditorBlock {
  const empty = { extent: svg.extent, sections: [], selectedId: null };
  const { sections } = addSections(empty, svg.drafts);
  return toEditorBlock({ extent: svg.extent, sections, objects: svg.objects });
}
