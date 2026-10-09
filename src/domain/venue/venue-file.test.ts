import { beforeAll, describe, expect, it } from "vitest";
import {
  hasStudy,
  importStudyModule,
  loadVenueJson,
  VENUE_FILES,
} from "../__fixtures__/study";
import { venueFileSchema, type SectionConfig } from "./types";
import {
  addSection,
  addSections,
  buildVenue,
  DEFAULT_EXTENT,
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
