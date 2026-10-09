"use client";

// Editor template (port seatmap-editor/app.js): ảnh sơ đồ làm nền → vẽ / tự nhận diện polygon section
// → cấu hình row/ghế → tự lưu draft lên server; xuất / nhập venue.json.
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { Extent, Point } from "@/domain/venue/types";
import { buildVenue, exportFile } from "@/domain/venue/venue-file";
import {
  saveTemplateDraftAction,
  setTemplateBackgroundAction,
} from "@/server/actions/templates";
import { autoDetect } from "./autodetect";
import { readImageSize, uploadBackground } from "./background";
import { downloadJson } from "./download";
import {
  editorReducer,
  initEditorState,
  readImportedFile,
  toEditorBlock,
} from "./editor-reducer";
import { EditorMap } from "./EditorMap";
import type { EditorTemplate } from "./EditorShell";
import { EditorToolbar } from "./EditorToolbar";
import { extentForImage } from "./projection";
import { SectionForm, SectionList } from "./SectionPanel";
import { useAutosave, type SaveStatus } from "./use-autosave";
import { useDrawTool } from "./use-draw-tool";

const FIT_PADDING = 40;
const DEFAULT_OPACITY = 0.6;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function saveLabel(status: SaveStatus): string {
  switch (status.kind) {
    case "pending":
    case "saving":
      return "Đang lưu…";
    case "saved":
      return `Đã tự lưu lúc ${status.at.toLocaleTimeString("vi-VN")}`;
    case "error":
      return `Lưu lỗi: ${status.message}`;
    default:
      return "";
  }
}

export default function EditorApp({ template }: { template: EditorTemplate }) {
  const [state, dispatch] = useReducer(editorReducer, template, (t) =>
    initEditorState(t.editorState, t.backgroundImageUrl),
  );
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [useOcr, setUseOcr] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  const { extent, sections } = state;
  const venue = useMemo(
    () => buildVenue({ extent, sections }),
    [extent, sections],
  );
  const block = useMemo(
    () => toEditorBlock({ extent, sections }),
    [extent, sections],
  );
  const saveStatus = useAutosave(template.id, block, saveTemplateDraftAction);

  const addRing = useCallback(
    (ring: Point[]) => dispatch({ type: "add-section", ring }),
    [],
  );
  const draw = useDrawTool(mapRef, addRing);
  const selected = state.sections.find((s) => s.id === state.selectedId);

  const fitExtent = ({ w, h }: Extent) =>
    mapRef.current?.fitBounds([-w, -h, w, h], { padding: FIT_PADDING });

  const selectAndFocus = (id: string) => {
    dispatch({ type: "select", id });
    const section = state.sections.find((s) => s.id === id);
    if (!section) return;
    const xs = section.ring.map((p) => p[0]);
    const ys = section.ring.map((p) => p[1]);
    const bounds: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    mapRef.current?.fitBounds(bounds, { padding: FIT_PADDING * 3, maxZoom: 7 });
  };

  async function onImage(file: File) {
    try {
      const size = await readImageSize(file);
      const imageExtent = extentForImage(size.width, size.height);
      const preview = URL.createObjectURL(file);
      dispatch({ type: "set-image", image: preview, extent: imageExtent });
      fitExtent(imageExtent);
      setMessage("Đang tải ảnh lên…");
      const url = await uploadBackground(template.id, file);
      const saved = await setTemplateBackgroundAction(template.id, url);
      if (!saved.ok) throw new Error(saved.error);
      dispatch({ type: "set-image", image: url });
      URL.revokeObjectURL(preview);
      setMessage("Đã lưu ảnh nền");
    } catch (error) {
      setMessage(
        `Ảnh chỉ hiển thị tạm trên trình duyệt này — ${errorMessage(error)}`,
      );
    }
  }

  async function onAutoDetect() {
    if (!state.image) return;
    const count = state.sections.length;
    const replace =
      count > 0 &&
      window.confirm(`Thay thế ${count} section hiện có? (Cancel = thêm vào)`);
    setDetecting(true);
    try {
      const drafts = await autoDetect(state.image, state.extent, {
        useOcr,
        onStatus: setMessage,
      });
      dispatch({ type: "add-sections", drafts, replace });
      const named = drafts.filter((d) => d.id).length;
      setMessage(
        `Đã thêm ${drafts.length} section (${named} tên đọc được bằng OCR) — kiểm tra lại từng section`,
      );
    } catch (error) {
      setMessage(`Nhận diện lỗi: ${errorMessage(error)}`);
    } finally {
      setDetecting(false);
    }
  }

  async function onImport(file: File) {
    try {
      const imported = readImportedFile(JSON.parse(await file.text()));
      dispatch({ type: "load", block: imported });
      fitExtent(imported.extent);
      setMessage(`Đã nhập ${imported.sections.length} section`);
    } catch (error) {
      setMessage(`Nhập lỗi: ${errorMessage(error)}`);
    }
  }

  async function onReset() {
    if (!window.confirm("Xoá toàn bộ section và ảnh nền?")) return;
    dispatch({ type: "reset" });
    const result = await setTemplateBackgroundAction(template.id, null);
    setMessage(result.ok ? "Đã xoá hết" : `Xoá ảnh nền lỗi: ${result.error}`);
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[520px] flex-col overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
      <EditorToolbar
        drawing={draw.active}
        detecting={detecting}
        hasImage={state.image !== null}
        opacity={opacity}
        useOcr={useOcr}
        status={[message, saveLabel(saveStatus)].filter(Boolean).join(" · ")}
        onImage={onImage}
        onOpacity={setOpacity}
        onToggleDraw={() => draw.setActive(!draw.active)}
        onAutoDetect={onAutoDetect}
        onUseOcr={setUseOcr}
        onExport={() => downloadJson("venue.json", exportFile(state))}
        onImport={onImport}
        onReset={onReset}
      />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <div className="relative min-h-0 flex-1">
          <EditorMap
            mapRef={mapRef}
            state={state}
            venue={venue}
            opacity={opacity}
            draw={draw}
            onSelect={(id) => dispatch({ type: "select", id })}
          />
        </div>
        <aside className="w-80 overflow-auto border-l border-zinc-200 p-3 max-md:h-[45vh] max-md:w-full max-md:border-t max-md:border-l-0 dark:border-zinc-800">
          <SectionList
            sections={state.sections}
            venue={venue}
            selectedId={state.selectedId}
            onSelect={selectAndFocus}
          />
          <SectionForm
            key={`${state.selectedId}:${state.revision}`}
            section={selected}
            onChange={(patch) =>
              selected &&
              dispatch({ type: "update-section", id: selected.id, patch })
            }
            onDelete={(id) => dispatch({ type: "remove-section", id })}
          />
        </aside>
      </div>
    </div>
  );
}
