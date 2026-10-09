// Phần thuần của seatmap-editor/store.js: thao tác danh sách section (immutable) + build venue
// + xuất/nhập file venue.json. Không có localStorage — lưu trữ do tầng trên lo.
import { centroid, generateRows, type GeneratedRow } from "./geometry";
import {
  editorBlockSchema,
  type Extent,
  type Point,
  type Ring,
  type RowFeature,
  type SeatFeature,
  type SectionConfig,
  type SectionFeature,
  type Venue,
  type VenueFile,
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

const collection = <F>(features: F[]) => ({
  type: "FeatureCollection" as const,
  features,
});

function buildSection(s: SectionConfig): VenueSection {
  const rows = generateRows(s)
    .filter(
      (r): r is GeneratedRow & { line: [Point, Point] } =>
        r.line !== null && r.seats.length > 0,
    )
    .map((r) => ({
      feature: {
        type: "Feature",
        properties: { section: s.id, row: r.name, seats: r.seats.length },
        geometry: { type: "LineString", coordinates: r.line },
      } satisfies RowFeature,
      seats: r.seats.map((c, k): SeatFeature => ({
        type: "Feature",
        properties: { section: s.id, row: r.name, seat: k + 1 },
        geometry: { type: "Point", coordinates: c },
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
  state: Pick<VenueDraft, "extent" | "sections">,
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
      field: collection([]),
      sections: collection(sections.map((s) => s.feature)),
      rows: collection(sections.flatMap((s) => s.rows.map((r) => r.feature))),
      seats: collection(
        sections.flatMap((s) => s.rows.flatMap((r) => r.seats)),
      ),
    },
  };
}

// File export = dữ liệu cho demo + cấu hình gốc để nhập lại vào editor
export function exportFile(
  state: Pick<VenueDraft, "extent" | "sections">,
): VenueFile {
  return {
    ...buildVenue(state),
    editor: { extent: state.extent, sections: [...state.sections] },
  };
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
    selectedId: null,
  };
}
