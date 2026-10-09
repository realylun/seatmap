import { describe, expect, it } from "vitest";
import type { DetectedShape } from "@/domain/venue/detect";
import type { SectionConfig } from "@/domain/venue/types";
import { exportFile } from "@/domain/venue/venue-file";
import { regionsToDrafts } from "./autodetect-drafts";
import { backgroundPathname } from "./background";
import {
  addVertex,
  closeRing,
  draftGeoJson,
  EMPTY_DRAFT,
  handleDrawKey,
  isNearFirst,
  moveCursor,
} from "./draw-tool";
import {
  editorReducer,
  initEditorState,
  initialEditorState,
  readImportedFile,
  toEditorBlock,
} from "./editor-reducer";
import { cleanName } from "./ocr";
import { extentForImage, imageCorners, pixelProjector } from "./projection";
import { FIELDS, formatField, parseField } from "./section-form";

const ring: SectionConfig["ring"] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
  [0, 0],
];
const field = (key: string) => FIELDS.find((f) => f.key === key)!;

describe("editorReducer", () => {
  const withSection = editorReducer(initialEditorState, {
    type: "add-section",
    ring,
  });

  it("initEditorState: editor_state hỏng → trống, hợp lệ → nạp", () => {
    expect(initEditorState({ nope: 1 }, null).sections).toEqual([]);
    const loaded = initEditorState(
      toEditorBlock(withSection),
      "https://x/bg.png",
    );
    expect(loaded.sections.map((s) => s.id)).toEqual(["S001"]);
    expect(loaded.image).toBe("https://x/bg.png");
  });

  it("thêm / sửa / chọn / xoá section, không mutate state cũ", () => {
    const updated = editorReducer(withSection, {
      type: "update-section",
      id: "S001",
      patch: { rowCount: 3 },
    });
    expect(updated.sections[0].rowCount).toBe(3);
    expect(withSection.sections[0].rowCount).toBe(10);
    expect(
      editorReducer(updated, { type: "select", id: null }).selectedId,
    ).toBeNull();
    expect(
      editorReducer(updated, { type: "remove-section", id: "S001" }).sections,
    ).toEqual([]);
  });

  it("thay hàng loạt (auto-detect, load, reset) tăng revision", () => {
    const detected = editorReducer(withSection, {
      type: "add-sections",
      drafts: [{ ring }],
      replace: true,
    });
    expect(detected.revision).toBe(1);
    expect(detected.sections.map((s) => s.id)).toEqual(["S001"]);
    const loaded = editorReducer(detected, {
      type: "load",
      block: { extent: { w: 5, h: 5 }, sections: [] },
    });
    expect([loaded.revision, loaded.extent.w]).toEqual([2, 5]);
    const reset = editorReducer({ ...loaded, image: "x" }, { type: "reset" });
    expect([reset.revision, reset.image, reset.sections.length]).toEqual([
      3,
      null,
      0,
    ]);
  });

  it("set-image giữ extent nếu không truyền", () => {
    const s1 = editorReducer(initialEditorState, {
      type: "set-image",
      image: "a",
      extent: { w: 8, h: 20 },
    });
    const s2 = editorReducer(s1, { type: "set-image", image: "b" });
    expect([s2.image, s2.extent.w]).toEqual(["b", 8]);
  });

  it("readImportedFile: đọc block editor từ venue.json, báo lỗi file sai", () => {
    const file = JSON.parse(JSON.stringify(exportFile(withSection))) as unknown;
    expect(readImportedFile(file).sections).toHaveLength(1);
    expect(() => readImportedFile({ version: 1 })).toThrow(/editor/);
  });
});

describe("projection", () => {
  it("extent theo tỉ lệ ảnh, cao ±20", () => {
    expect(extentForImage(2000, 1500)).toEqual({ w: 80 / 3, h: 20 });
    expect(imageCorners({ w: 2, h: 1 })).toEqual([
      [-2, 1],
      [2, 1],
      [2, -1],
      [-2, -1],
    ]);
  });

  it("pixel góc ảnh → góc extent, tâm ảnh → (0,0)", () => {
    const project = pixelProjector({ w: 40, h: 20 }, 1000, 500);
    const [x0, y0] = project([0, 0]);
    expect(x0).toBeCloseTo(-40, 9);
    expect(y0).toBeCloseTo(20, 9);
    const [cx, cy] = project([500, 250]);
    expect(cx).toBeCloseTo(0, 9);
    expect(cy).toBeCloseTo(0, 9);
    const [x1, y1] = project([1000, 500]);
    expect(x1).toBeCloseTo(40, 9);
    expect(y1).toBeCloseTo(-20, 9);
  });
});

const region = (x: number, y: number): DetectedShape => ({
  ring: [
    [x, y],
    [x + 20, y],
    [x + 20, y + 10],
    [x, y + 10],
    [x, y],
  ],
  bbox: { x, y, w: 21, h: 11 },
  center: [x + 10, y + 5],
  area: 231,
});

describe("regionsToDrafts", () => {
  it("đổi toạ độ pixel → map, giữ tên OCR, row ước lượng theo độ sâu", () => {
    const drafts = regionsToDrafts(
      [region(10, 10), region(170, 180)],
      ["101", null],
      { w: 20, h: 20 },
      {
        width: 200,
        height: 200,
      },
    );
    expect(drafts[0].id).toBe("101");
    expect(drafts[1]).not.toHaveProperty("id");
    expect(drafts[0].ring[0][0]).toBeCloseTo(-18, 6);
    expect(drafts[0].ring[0][1]).toBeGreaterThan(0); // pixel phía trên → vĩ độ dương
    expect(
      drafts.every((d) => (d.rowCount ?? 0) >= 1 && (d.rowCount ?? 0) <= 40),
    ).toBe(true);
    expect(drafts.every((d) => Number.isInteger(d.frontEdge))).toBe(true);
  });
});

describe("draw tool", () => {
  const triangle = [
    [0, 0],
    [1, 0],
    [1, 1],
  ] as const;
  const drawn = triangle.reduce(
    (d, p) => addVertex(d, [p[0], p[1]]),
    EMPTY_DRAFT,
  );

  it("khép ring cần ≥ 3 đỉnh", () => {
    expect(closeRing(addVertex(EMPTY_DRAFT, [0, 0]))).toBeNull();
    expect(closeRing(drawn)).toEqual([...triangle, [0, 0]]);
  });

  it("snap khi click gần đỉnh đầu", () => {
    expect(isNearFirst(drawn, { x: 105, y: 100 }, { x: 100, y: 100 })).toBe(
      true,
    );
    expect(isNearFirst(drawn, { x: 120, y: 100 }, { x: 100, y: 100 })).toBe(
      false,
    );
  });

  it("phím: Enter khép, Backspace xoá đỉnh, Esc huỷ rồi thoát", () => {
    expect(handleDrawKey(drawn, "Enter")?.ring).toHaveLength(4);
    expect(handleDrawKey(drawn, "Backspace")?.draft.vertices).toHaveLength(2);
    expect(handleDrawKey(drawn, "Escape")).toEqual({
      draft: EMPTY_DRAFT,
      ring: null,
      exit: false,
    });
    expect(handleDrawKey(EMPTY_DRAFT, "Escape")?.exit).toBe(true);
    expect(handleDrawKey(drawn, "a")).toBeNull();
  });

  it("geojson nháp: điểm + đường tới con trỏ", () => {
    const fc = draftGeoJson(moveCursor(drawn, [0.5, 0.5]));
    expect(fc.features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "Point",
      "Point",
      "LineString",
    ]);
    expect(fc.features.at(-1)?.geometry.coordinates).toHaveLength(4);
  });
});

describe("section form", () => {
  const section = {
    ...initEditorState(null, null),
    ...editorReducer(initialEditorState, { type: "add-section", ring }),
  }.sections[0];

  it("format giá trị hiện tại", () => {
    expect(formatField(field("rowSkip"), section)).toBe("I,O");
    expect(formatField(field("seatSpacing"), section)).toBe("0.25");
  });

  it("parse hợp lệ → patch", () => {
    expect(parseField(field("rowCount"), "12")).toEqual({ rowCount: 12 });
    expect(parseField(field("rowSkip"), " i , o ,")).toEqual({
      rowSkip: ["i", "o"],
    });
    expect(parseField(field("overrides"), "")).toEqual({ overrides: "" });
    expect(parseField(field("id"), " 101 ")).toEqual({ id: "101" });
  });

  it("đang gõ dở / không hợp lệ → null", () => {
    expect(parseField(field("rowCount"), "")).toBeNull();
    expect(parseField(field("rowCount"), "0")).toBeNull();
    expect(parseField(field("rowCount"), "2.5")).toBeNull();
    expect(parseField(field("seatSpacing"), "0.01")).toBeNull();
    expect(parseField(field("id"), "  ")).toBeNull();
    expect(parseField(field("id"), "1|2")).toBeNull();
  });
});

describe("cleanName (OCR)", () => {
  it.each([
    ["101", "101"],
    [" sec-12a \n", "SEC12A"],
    ["ABCD12", null],
    ["c12", "C12"],
    ["FL2A", "FL2A"],
    ["HELLO", null],
    ["", null],
  ])("%j → %j", (text, expected) => {
    expect(cleanName(text)).toBe(expected);
  });
});

describe("backgroundPathname", () => {
  const ROUTE_RULE = /^(events|backgrounds)\/[\w.-]{1,100}$/;
  it("khớp quy tắc của /api/blob/upload", () => {
    const id = "0b8f6a52-1f0e-4c3a-9a51-2f7e1c9d4b10";
    expect(backgroundPathname(id, "Sân Rosetta (v2).PNG")).toMatch(ROUTE_RULE);
    expect(backgroundPathname(id, "../../etc/passwd")).toMatch(ROUTE_RULE);
    const long = backgroundPathname(id, `${"x".repeat(300)}.png`);
    expect(long).toMatch(ROUTE_RULE);
    expect(long.endsWith(".png")).toBe(true);
  });
});
