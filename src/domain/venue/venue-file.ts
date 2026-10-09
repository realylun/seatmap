// Phần thuần của seatmap-editor/store.js: thao tác danh sách section (immutable) + build venue
// + xuất/nhập file venue.json. Không có localStorage — lưu trữ do tầng trên lo.
import {
  centroid,
  generateRows,
  samePoint,
  type GeneratedRow,
} from "./geometry";
import {
  editorBlockSchema,
  type EditorBlock,
  type ExplicitRow,
  type Extent,
  type Point,
  type Ring,
  type RowFeature,
  type SeatFeature,
  type SectionConfig,
  type SectionFeature,
  type Venue,
  type VenueFile,
  type VenueObject,
  type VenueSection,
} from "./types";

export const DEFAULT_EXTENT: Extent = { w: 26, h: 20 };

export const DEFAULT_SECTION = {
  frontEdge: 0,
  rowStart: "A",
  rowCount: 10,
  rowSkip: ["I", "O"],
  seatsPerRow: 0,
  overrides: "",
  seatSpacing: 0.25,
  numbering: "ltr",
} as const satisfies Omit<SectionConfig, "id" | "ring">;

/** Tối thiểu cần để build venue. State của editor có thể mang thêm field (ảnh nền...) */
export type VenueDraft = {
  readonly extent: Extent;
  readonly sections: readonly SectionConfig[];
  readonly selectedId: string | null;
  /** Sân khấu... — thiếu = không có */
  readonly objects?: readonly VenueObject[];
};

export type SectionDraft = Partial<SectionConfig> & {
  readonly ring: SectionConfig["ring"];
};

const autoId = (no: number) => `S${String(no).padStart(3, "0")}`;

const withDefaults = (draft: SectionDraft, id: string): SectionConfig => ({
  ...DEFAULT_SECTION,
  rowSkip: [...DEFAULT_SECTION.rowSkip],
  ...draft,
  id,
});

export function addSection<S extends VenueDraft>(
  state: S,
  ring: SectionConfig["ring"],
): S {
  const id = autoId(state.sections.length + 1);
  const section = withDefaults({ ring }, id);
  return { ...state, sections: [...state.sections, section], selectedId: id };
}

// Thêm hàng loạt (từ nhận diện ảnh). Tên trùng/thiếu → tự đặt S### để id luôn duy nhất
export function addSections<S extends VenueDraft>(
  state: S,
  drafts: readonly SectionDraft[],
  { replace = false }: { replace?: boolean } = {},
): S {
  const base = replace ? [] : state.sections;
  const initial = {
    taken: new Set(base.map((s) => s.id)),
    sections: [] as SectionConfig[],
  };
  const { sections } = drafts.reduce((acc, draft, i) => {
    const fallback = autoId(base.length + i + 1);
    const wanted = draft.id && !acc.taken.has(draft.id) ? draft.id : fallback;
    const id = acc.taken.has(wanted) ? `${wanted}-${i + 1}` : wanted;
    return {
      taken: new Set([...acc.taken, id]),
      sections: [...acc.sections, withDefaults(draft, id)],
    };
  }, initial);
  return { ...state, sections: [...base, ...sections], selectedId: null };
}

export function updateSection<S extends VenueDraft>(
  state: S,
  id: string,
  patch: Partial<SectionConfig>,
): S {
  const sections = state.sections.map((s) =>
    s.id === id ? { ...s, ...patch } : s,
  );
  const renamed = patch.id !== undefined && patch.id !== "" && patch.id !== id;
  return {
    ...state,
    sections,
    selectedId: renamed ? patch.id : state.selectedId,
  };
}

export function removeSection<S extends VenueDraft>(state: S, id: string): S {
  return {
    ...state,
    sections: state.sections.filter((s) => s.id !== id),
    selectedId: null,
  };
}

const sectionFeature = (id: string, ring: Ring): SectionFeature => ({
  type: "Feature",
  properties: { section: id },
  geometry: { type: "Polygon", coordinates: [[...ring]] },
});

const closedRing = (ring: Ring): Point[] => {
  const closed = samePoint(ring[0], ring[ring.length - 1]);
  return closed ? [...ring] : [...ring, ring[0]];
};

const objectFeature = (o: VenueObject) => ({
  type: "Feature" as const,
  properties: { kind: o.kind },
  geometry: { type: "Polygon", coordinates: [closedRing(o.ring)] },
});

const collection = <F>(features: F[]) => ({
  type: "FeatureCollection" as const,
  features,
});

type BuiltRow = {
  readonly name: string;
  readonly line: [Point, Point];
  readonly seats: readonly { readonly number: number; readonly at: Point }[];
};

function generatedRows(s: SectionConfig): BuiltRow[] {
  return generateRows(s)
    .filter(
      (r): r is GeneratedRow & { line: [Point, Point] } =>
        r.line !== null && r.seats.length > 0,
    )
    .map((r) => ({
      name: r.name,
      line: r.line,
      seats: r.seats.map((at, k) => ({ number: k + 1, at })),
    }));
}

// A, B, ..., Z, AA, BB... và 1, 2, ..., 10: tên ngắn trước, cùng độ dài thì so tự nhiên
const byRowName = (a: ExplicitRow, b: ExplicitRow) =>
  a.name.length - b.name.length ||
  a.name.localeCompare(b.name, "en", { numeric: true });

function explicitRows(rows: readonly ExplicitRow[]): BuiltRow[] {
  return rows.toSorted(byRowName).map((r) => {
    // copy toạ độ: Venue build ra không dùng chung mảng với state editor
    const seats = r.seats
      .toSorted((a, b) => a.number - b.number)
      .map((seat) => ({ number: seat.number, at: [...seat.at] as Point }));
    const [first, last] = [seats[0].at, seats[seats.length - 1].at];
    return { name: r.name, line: [[...first], [...last]], seats };
  });
}

function buildSection(s: SectionConfig): VenueSection {
  const built = s.explicitRows
    ? explicitRows(s.explicitRows)
    : generatedRows(s);
  const rows = built.map((r) => ({
    feature: {
      type: "Feature",
      properties: { section: s.id, row: r.name, seats: r.seats.length },
      geometry: { type: "LineString", coordinates: r.line },
    } satisfies RowFeature,
    seats: r.seats.map((seat): SeatFeature => ({
      type: "Feature",
      properties: { section: s.id, row: r.name, seat: seat.number },
      geometry: { type: "Point", coordinates: seat.at },
    })),
  }));
  return {
    id: s.id,
    center: centroid(s.ring),
    feature: sectionFeature(s.id, s.ring),
    rows,
  };
}

// Dữ liệu hiển thị (dùng cho cả preview trong editor lẫn file export)
export function buildVenue(
  state: Pick<VenueDraft, "extent" | "sections" | "objects">,
): Venue {
  const sections = state.sections.map(buildSection);
  const { w, h } = state.extent;
  return {
    version: 1,
    bounds: [
      [-w, -h],
      [w, h],
    ],
    sections,
    geojson: {
      field: collection((state.objects ?? []).map(objectFeature)),
      sections: collection(sections.map((s) => s.feature)),
      rows: collection(sections.flatMap((s) => s.rows.map((r) => r.feature))),
      seats: collection(
        sections.flatMap((s) => s.rows.flatMap((r) => r.seats)),
      ),
    },
  };
}

// Block editor (autosave + file export). Không có objects thì bỏ hẳn key → giống hệt file cũ
export function toEditorBlock(
  state: Pick<VenueDraft, "extent" | "sections" | "objects">,
): EditorBlock {
  const objects = state.objects ?? [];
  return {
    extent: state.extent,
    sections: [...state.sections],
    ...(objects.length > 0 ? { objects: [...objects] } : {}),
  };
}

// File export = dữ liệu cho demo + cấu hình gốc để nhập lại vào editor
export function exportFile(
  state: Pick<VenueDraft, "extent" | "sections" | "objects">,
): VenueFile {
  return { ...buildVenue(state), editor: toEditorBlock(state) };
}

export function importFile<S extends VenueDraft>(state: S, json: unknown): S {
  const editor =
    typeof json === "object" && json !== null
      ? (json as { editor?: unknown }).editor
      : undefined;
  const parsed = editorBlockSchema.safeParse(editor);
  if (!parsed.success) {
    throw new Error(
      'File không có phần "editor" hợp lệ — hãy chọn file được xuất từ editor này.',
      {
        cause: parsed.error,
      },
    );
  }
  return {
    ...state,
    extent: parsed.data.extent,
    sections: parsed.data.sections,
    objects: parsed.data.objects ?? [],
    selectedId: null,
  };
}
