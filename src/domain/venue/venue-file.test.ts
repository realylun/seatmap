import { beforeAll, describe, expect, it } from "vitest";
import {
  hasStudy,
  importStudyModule,
  loadVenueJson,
  VENUE_FILES,
} from "../__fixtures__/study";
import {
  editorBlockSchema,
  sectionConfigSchema,
  venueFileSchema,
  type SectionConfig,
  type VenueObject,
} from "./types";
import {
  addSection,
  addSections,
  buildVenue,
  DEFAULT_EXTENT,
  DEFAULT_SECTION,
  exportFile,
  importFile,
  removeSection,
  updateSection,
  type VenueDraft,
} from "./venue-file";

const ring: SectionConfig["ring"] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
  [0, 0],
];

const empty: VenueDraft = Object.freeze({
  extent: DEFAULT_EXTENT,
  sections: [],
  selectedId: null,
});

describe("thao tác section (immutable)", () => {
  it("addSection đặt id S### và chọn section mới", () => {
    const state = addSection(addSection(empty, ring), ring);
    expect(state.sections.map((s) => s.id)).toEqual(["S001", "S002"]);
    expect(state.selectedId).toBe("S002");
    expect(state.sections[0].rowSkip).toEqual(["I", "O"]);
    expect(empty.sections).toHaveLength(0);
  });

  it("addSections: id trùng/thiếu → tự đặt id duy nhất", () => {
    const base = addSection(empty, ring);
    const state = addSections(base, [
      { id: "S001", ring },
      { ring },
      { id: "101", ring },
      { id: "101", ring },
    ]);
    expect(state.sections.map((s) => s.id)).toEqual([
      "S001",
      "S002",
      "S003",
      "101",
      "S005",
    ]);
    expect(state.selectedId).toBeNull();
    expect(base.sections).toHaveLength(1);
  });

  it("addSections replace bỏ section cũ", () => {
    const state = addSections(
      addSection(empty, ring),
      [{ id: "A1", ring, rowCount: 3 }],
      { replace: true },
    );
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0]).toMatchObject({
      id: "A1",
      rowCount: 3,
      seatSpacing: 0.25,
    });
  });

  it("updateSection đổi tên → selectedId theo tên mới; không mutate section cũ", () => {
    const before = addSection(empty, ring);
    const after = updateSection(before, "S001", { id: "101", rowCount: 4 });
    expect(after.sections[0]).toMatchObject({ id: "101", rowCount: 4 });
    expect(after.selectedId).toBe("101");
    expect(before.sections[0]).toMatchObject({ id: "S001", rowCount: 10 });
    expect(updateSection(before, "S001", { rowCount: 2 }).selectedId).toBe(
      "S001",
    );
  });

  it("removeSection", () => {
    const state = removeSection(
      addSection(addSection(empty, ring), ring),
      "S001",
    );
    expect(state.sections.map((s) => s.id)).toEqual(["S002"]);
    expect(state.selectedId).toBeNull();
  });

  it("giữ field thêm của state editor (vd. ảnh nền)", () => {
    const state = addSection({ ...empty, image: "blob:x" }, ring);
    expect(state.image).toBe("blob:x");
  });
});

describe("buildVenue / exportFile / importFile", () => {
  const draft = addSection(empty, ring);

  it("buildVenue sinh row + ghế, bounds theo extent", () => {
    const venue = buildVenue(draft);
    expect(venue.bounds).toEqual([
      [-26, -20],
      [26, 20],
    ]);
    expect(venue.sections[0].rows).toHaveLength(10);
    expect(venue.geojson.seats.features[0].properties).toEqual({
      section: "S001",
      row: "A",
      seat: 1,
    });
    expect(venueFileSchema.safeParse(exportFile(draft)).success).toBe(true);
  });

  it("export → import vòng tròn", () => {
    const file = JSON.parse(JSON.stringify(exportFile(draft))) as unknown;
    const restored = importFile({ ...empty, selectedId: "x" }, file);
    expect(restored.sections).toEqual(draft.sections);
    expect(restored.extent).toEqual(draft.extent);
    expect(restored.selectedId).toBeNull();
  });

  it("block editor cũ (không có objects) vẫn hợp lệ", () => {
    const parsed = editorBlockSchema.safeParse({
      extent: DEFAULT_EXTENT,
      sections: draft.sections,
    });
    expect(parsed.success).toBe(true);
    expect(exportFile(draft).editor).not.toHaveProperty("objects");
    expect(buildVenue(draft).geojson.field.features).toEqual([]);
  });

  it("sân khấu (objects) → geojson.field polygon kind=stage, ring khép kín", () => {
    const open = ring.slice(0, 4);
    const objects: VenueObject[] = [{ kind: "stage", ring: [...open, [1, 1]] }];
    const venue = buildVenue({ ...draft, objects });
    expect(venue.geojson.field.features).toEqual([
      {
        type: "Feature",
        properties: { kind: "stage" },
        geometry: { type: "Polygon", coordinates: [[...open, [1, 1], [0, 0]]] },
      },
    ]);
    const file = JSON.parse(
      JSON.stringify(exportFile({ ...draft, objects })),
    ) as unknown;
    expect(venueFileSchema.safeParse(file).success).toBe(true);
    expect(importFile(empty, file).objects).toEqual(objects);
    expect(importFile(empty, exportFile(draft)).objects).toEqual([]);
  });

  it("importFile báo lỗi khi thiếu/sai block editor", () => {
    expect(() => importFile(empty, { version: 1 })).toThrow(/editor/);
    expect(() => importFile(empty, null)).toThrow(/editor/);
    expect(() =>
      importFile(empty, {
        editor: { extent: { w: 1, h: 1 }, sections: [{ id: "x" }] },
      }),
    ).toThrow(/editor/);
  });
});

type StoreJs = {
  buildVenue: typeof buildVenue;
  exportFile: typeof exportFile;
  addSections: typeof addSections;
};

const withRows = (section: SectionConfig, explicitRows: unknown) =>
  sectionConfigSchema.safeParse({ ...section, explicitRows }).success;

describe("explicitRows (ghế đặt tay, vd. từ SVG)", () => {
  const explicit: SectionConfig = {
    ...DEFAULT_SECTION,
    rowSkip: [],
    id: "311",
    ring,
    explicitRows: [
      {
        name: "B",
        seats: [
          { number: 2, at: [2, 2] },
          { number: 1, at: [1, 2] },
        ],
      },
      { name: "AA", seats: [{ number: 7, at: [1, 2.5] }] },
      {
        name: "A",
        seats: [
          { number: 1, at: [1, 1] },
          { number: 3, at: [3, 1] },
          { number: 2, at: [2, 1] },
        ],
      },
    ],
  };

  const built = () =>
    buildVenue({ extent: DEFAULT_EXTENT, sections: [explicit] });

  it("dùng đúng ghế đặt tay, bỏ qua tham số sinh row", () => {
    const [section] = built().sections;
    expect(section.rows.map((r) => r.feature.properties.row)).toEqual([
      "A",
      "B",
      "AA",
    ]);
    expect(section.rows.map((r) => r.seats.length)).toEqual([3, 2, 1]);
  });

  it("giữ số ghế gốc, sắp theo số; LineString = ghế đầu → ghế cuối", () => {
    const rowA = built().sections[0].rows[0];
    expect(rowA.seats.map((s) => s.properties.seat)).toEqual([1, 2, 3]);
    expect(rowA.seats.map((s) => s.geometry.coordinates)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(rowA.feature.properties).toEqual({
      section: "311",
      row: "A",
      seats: 3,
    });
    expect(rowA.feature.geometry.coordinates).toEqual([
      [1, 1],
      [3, 1],
    ]);
  });

  it("row 1 ghế vẫn có LineString 2 điểm; số ghế không cần bắt đầu từ 1", () => {
    const rowAA = built().sections[0].rows[2];
    expect(rowAA.seats[0].properties.seat).toBe(7);
    expect(rowAA.feature.geometry.coordinates).toEqual([
      [1, 2.5],
      [1, 2.5],
    ]);
  });

  it("toạ độ build ra không dùng chung mảng với config", () => {
    const seat = built().sections[0].rows[0].seats[0];
    expect(seat.geometry.coordinates).not.toBe(
      explicit.explicitRows?.[2].seats[0].at,
    );
  });

  it("geojson gộp và file export hợp lệ theo schema", () => {
    const venue = built();
    expect(venue.geojson.seats.features).toHaveLength(6);
    expect(venue.geojson.rows.features).toHaveLength(3);
    const file = exportFile({ extent: DEFAULT_EXTENT, sections: [explicit] });
    expect(() => venueFileSchema.parse(file)).not.toThrow();
    expect(file.editor.sections[0].explicitRows).toHaveLength(3);
  });

  it("schema: thiếu explicitRows vẫn hợp lệ (file cũ)", () => {
    const { explicitRows: _, ...legacy } = explicit;
    expect(sectionConfigSchema.safeParse(legacy).success).toBe(true);
  });

  it("schema: từ chối row rỗng, trùng tên row, trùng số ghế", () => {
    expect(withRows(explicit, [{ name: "A", seats: [] }])).toBe(false);
    expect(withRows(explicit, [])).toBe(false);
    expect(
      withRows(explicit, [
        { name: "A", seats: [{ number: 1, at: [0, 0] }] },
        { name: "a ", seats: [{ number: 2, at: [1, 0] }] },
      ]),
    ).toBe(false);
    expect(
      withRows(explicit, [
        { name: "A", seats: [{ number: 1, at: [0, 0] }] },
        { name: "A", seats: [{ number: 2, at: [1, 0] }] },
      ]),
    ).toBe(false);
    expect(
      withRows(explicit, [
        {
          name: "A",
          seats: [
            { number: 1, at: [0, 0] },
            { number: 1, at: [1, 0] },
          ],
        },
      ]),
    ).toBe(false);
  });
});

describe.skipIf(!hasStudy)("parity với store.js gốc (AC4)", () => {
  let js: StoreJs;
  beforeAll(async () => {
    js = await importStudyModule<StoreJs>("seatmap-editor/store.js");
  });

  it.each(VENUE_FILES)("buildVenue + exportFile deep-equal trên %s", (name) => {
    const file = venueFileSchema.parse(loadVenueJson(name));
    const state = { ...empty, ...file.editor };
    expect(buildVenue(state)).toEqual(js.buildVenue(state));
    expect(exportFile(state)).toEqual(js.exportFile(state));
    // File mẫu cũng chính là output của editor gốc → port tái tạo lại y hệt
    expect(exportFile(state)).toEqual(loadVenueJson(name));
  });

  it.each(VENUE_FILES)("addSections khớp bản gốc trên %s", (name) => {
    const { editor } = venueFileSchema.parse(loadVenueJson(name));
    const drafts = editor.sections
      .slice(0, 5)
      .map(({ id, ring: r }, i) => (i % 2 ? { id, ring: r } : { ring: r }));
    const state = { ...empty, ...editor };
    expect(addSections(state, drafts)).toEqual(js.addSections(state, drafts));
  });
});
