// Một khu trong SVG → section nháp. Hai pha để tâm venue (cần ring mọi khu khi thiếu sân)
// được tính trước khi dựng: findOutline (ring) → buildSection (ghế, tham số, cạnh trước).
import { ringToDraft } from "../drafts";
import { pointInRing } from "../geometry";
import type { ExplicitRow, Point } from "../types";
import type { SectionDraft } from "../venue-file";
import type { SvgNode } from "./parse-svg";
import { sectionParams } from "./svg-params";
import {
  distanceToRing,
  docRing,
  issue,
  label,
  seatShape,
  SHAPE_TAGS,
  type SvgIssue,
} from "./svg-shapes";

export type ToMap = (p: Point) => Point;

export type SectionOutline = {
  readonly id: string;
  readonly outline: SvgNode;
  /** toạ độ tài liệu */
  readonly ring: readonly Point[];
  readonly shapes: readonly SvgNode[];
};

type Seat = {
  readonly row: string;
  readonly number: number;
  readonly at: Point;
};

const EDGE_TOLERANCE = 1.01; // ghế chạm mép trong phạm vi bán kính vẫn hợp lệ

const isIssue = (value: object): value is SvgIssue => "level" in value;

/** Chọn đúng 1 outline của khu → ring toạ độ tài liệu */
export function findOutline(
  id: string,
  nodes: readonly SvgNode[],
): SectionOutline | SvgIssue {
  const shapes = nodes.filter(
    (n) => SHAPE_TAGS.has(n.tag) && n.data.role !== "label",
  );
  const marked = shapes.filter((n) => n.data.role === "outline");
  const outlines =
    marked.length > 0
      ? marked
      : shapes.filter(
          (n) => n.data.seat === undefined && n.data.row === undefined,
        );
  if (outlines.length !== 1) {
    const message =
      outlines.length === 0
        ? `Khu ${id} không có outline (rect/polygon/path, hoặc data-role="outline")`
        : `Khu ${id} có ${outlines.length} outline — trùng id khu, hoặc đánh dấu outline bằng data-role="outline"`;
    return issue("error", message, id);
  }
  const outline = outlines[0];
  const ring = docRing(outline);
  if (!ring.ok) return issue("error", `Khu ${id}: ${ring.error}`, id, outline);
  return { id, outline, ring: ring.value, shapes };
}

function readSeat(
  node: SvgNode,
  s: SectionOutline,
  toMap: ToMap,
): Seat | SvgIssue {
  const fail = (m: string) =>
    issue("error", `Khu ${s.id}, ghế ${label(node)}: ${m}`, s.id, node);
  const row = node.data.row?.trim();
  if (!row) return fail("thiếu data-row (hoặc group row-…)");
  const seatText = node.data.seat ?? "";
  if (!/^\d+$/.test(seatText) || Number(seatText) < 1)
    return fail(`số ghế "${seatText}" không hợp lệ`);
  const shape = seatShape(node);
  if (typeof shape === "string") return fail(shape);
  const inside =
    pointInRing(shape.center, s.ring) ||
    distanceToRing(shape.center, s.ring) <= shape.radius * EDGE_TOLERANCE;
  if (!inside) return fail(`nằm ngoài outline (row ${row}, ghế ${seatText})`);
  return { row, number: Number(seatText), at: toMap(shape.center) };
}

function groupRows(
  seats: readonly Seat[],
  section: string,
): ExplicitRow[] | SvgIssue[] {
  const rows = new Map<string, { name: string; seats: Seat[] }>();
  for (const seat of seats) {
    const key = seat.row.toUpperCase();
    const row = rows.get(key) ?? { name: seat.row, seats: [] };
    rows.set(key, { name: row.name, seats: row.seats.concat(seat) });
  }
  const duplicates = [...rows.values()].flatMap((row) => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const { number } of row.seats)
      (seen.has(number) ? dupes : seen).add(number);
    return [...dupes].map((n) =>
      issue(
        "error",
        `Khu ${section}, row ${row.name}: số ghế ${n} bị trùng`,
        section,
      ),
    );
  });
  if (duplicates.length > 0) return duplicates;
  return [...rows.values()].map((row) => ({
    name: row.name,
    seats: row.seats.map(({ number, at }) => ({ number, at })),
  }));
}

/** Hình trong khu không phải outline / ghế: trong row → lỗi (ghế thiếu số), còn lại → cảnh báo */
function leftoverIssues(s: SectionOutline): SvgIssue[] {
  const leftovers = s.shapes.filter(
    (n) => n !== s.outline && n.data.seat === undefined,
  );
  const inRow = leftovers.filter((n) => n.data.row !== undefined);
  const decorative = leftovers.length - inRow.length;
  return [
    ...inRow.map((n) =>
      issue(
        "error",
        `Khu ${s.id}, row ${n.data.row}: ${label(n)} không có số ghế (data-seat hoặc tên seat-<số>)`,
        s.id,
        n,
      ),
    ),
    ...(decorative > 0
      ? [
          issue(
            "warning",
            `Khu ${s.id}: bỏ qua ${decorative} hình không phải outline/ghế`,
            s.id,
          ),
        ]
      : []),
  ];
}

function paramIssues(s: SectionOutline, edgeCount: number) {
  const params = sectionParams(s.outline.data);
  const { frontEdge } = params.params;
  const edgeError =
    frontEdge !== undefined && (frontEdge < 0 || frontEdge >= edgeCount)
      ? [
          `data-front-edge phải trong khoảng 0…${edgeCount - 1} (số cạnh sau khi bỏ điểm thẳng hàng)`,
        ]
      : [];
  const issues = [...params.errors, ...edgeError].map((m) =>
    issue("error", `Khu ${s.id}: ${m}`, s.id, s.outline),
  );
  return { params: params.params, issues };
}

export function buildSection(
  s: SectionOutline,
  toMap: ToMap,
  venueCenter: Point,
): { draft: SectionDraft | null; issues: SvgIssue[] } {
  const ring = s.ring.map(toMap);
  const { params, issues: paramErrors } = paramIssues(s, ring.length - 1);
  const read = s.shapes
    .filter((n) => n !== s.outline && n.data.seat !== undefined)
    .map((n) => readSeat(n, s, toMap));
  const rows = groupRows(
    read.filter((r): r is Seat => !isIssue(r)),
    s.id,
  );
  const explicitRows = rows.filter((r): r is ExplicitRow => !isIssue(r));
  const leftovers = leftoverIssues(s);
  const errors = [
    ...paramErrors,
    ...read.filter(isIssue),
    ...rows.filter(isIssue),
    ...leftovers.filter((i) => i.level === "error"),
  ];
  const warnings = leftovers.filter((i) => i.level === "warning");
  if (errors.length > 0)
    return { draft: null, issues: [...errors, ...warnings] };
  const base = { id: s.id, ...ringToDraft(ring, venueCenter), ...params };
  if (explicitRows.length > 0)
    return {
      draft: { ...base, explicitRows, rowCount: explicitRows.length },
      issues: warnings,
    };
  const noSeats = issue(
    "warning",
    `Khu ${s.id} không có ghế — sẽ sinh tự động theo tham số row`,
    s.id,
  );
  return { draft: base, issues: [...warnings, noSeats] };
}
