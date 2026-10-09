// State của editor (immutable reducer) — bọc các thao tác thuần ở domain/venue/venue-file.ts,
// thêm ảnh nền + `revision` để form biết khi nào phải nạp lại giá trị (import, auto-detect, reset).
import {
  editorBlockSchema,
  type EditorBlock,
  type Extent,
  type SectionConfig,
  type VenueObject,
} from "@/domain/venue/types";
import {
  addSection,
  addSections,
  DEFAULT_EXTENT,
  importFile,
  removeSection,
  toEditorBlock,
  updateSection,
  type SectionDraft,
  type VenueDraft,
} from "@/domain/venue/venue-file";
export { blockFromSvg } from "@/domain/venue/svg/svg-venue";
export { toEditorBlock };

export type EditorState = VenueDraft & {
  readonly objects: readonly VenueObject[];
  /** URL ảnh nền đang hiển thị (Blob URL đã upload hoặc object URL cục bộ) */
  readonly image: string | null;
  /** Tăng khi danh sách section bị thay hàng loạt → form cấu hình nạp lại */
  readonly revision: number;
};

export type EditorAction =
  | { type: "add-section"; ring: SectionConfig["ring"] }
  | { type: "add-sections"; drafts: readonly SectionDraft[]; replace: boolean }
  | { type: "update-section"; id: string; patch: Partial<SectionConfig> }
  | { type: "remove-section"; id: string }
  | { type: "set-objects"; objects: readonly VenueObject[] }
  | { type: "select"; id: string | null }
  | { type: "set-image"; image: string | null; extent?: Extent }
  | { type: "load"; block: EditorBlock }
  | { type: "reset" };

export const initialEditorState: EditorState = {
  image: null,
  extent: DEFAULT_EXTENT,
  sections: [],
  objects: [],
  selectedId: null,
  revision: 0,
};

/** editor_state trong DB (unknown) → state ban đầu; dữ liệu hỏng thì bắt đầu trống */
export function initEditorState(
  editorState: unknown,
  image: string | null,
): EditorState {
  const parsed = editorBlockSchema.safeParse(editorState);
  const block = parsed.success
    ? parsed.data
    : { extent: DEFAULT_EXTENT, sections: [] };
  return {
    ...initialEditorState,
    ...block,
    objects: block.objects ?? [],
    image,
  };
}

/** File venue.json người dùng chọn → block editor; throw Error có thông báo thân thiện */
export function readImportedFile(json: unknown): EditorBlock {
  return toEditorBlock(importFile(initialEditorState, json));
}

const bump = (state: EditorState): EditorState => ({
  ...state,
  revision: state.revision + 1,
});

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "add-section":
      return addSection(state, action.ring);
    case "add-sections":
      return bump(
        addSections(state, action.drafts, { replace: action.replace }),
      );
    case "update-section":
      return updateSection(state, action.id, action.patch);
    case "remove-section":
      return removeSection(state, action.id);
    case "set-objects":
      return { ...state, objects: action.objects };
    case "select":
      return { ...state, selectedId: action.id };
    case "set-image":
      return {
        ...state,
        image: action.image,
        extent: action.extent ?? state.extent,
      };
    case "load":
      return bump({
        ...state,
        ...action.block,
        objects: action.block.objects ?? [],
        selectedId: null,
      });
    case "reset":
      return { ...initialEditorState, revision: state.revision + 1 };
    default:
      return state;
  }
}
