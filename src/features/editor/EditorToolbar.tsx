"use client";

// Thanh công cụ (port header của seatmap-editor/index.html).
import type { ChangeEvent, ReactNode } from "react";

const btnCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";
const activeCls =
  "rounded border border-red-600 bg-red-600 px-2.5 py-1 text-sm text-white";

type Props = {
  readonly drawing: boolean;
  readonly detecting: boolean;
  readonly hasImage: boolean;
  readonly opacity: number;
  readonly useOcr: boolean;
  readonly status: ReactNode;
  readonly onImage: (file: File) => void;
  readonly onOpacity: (value: number) => void;
  readonly onToggleDraw: () => void;
  readonly onAutoDetect: () => void;
  readonly onUseOcr: (value: boolean) => void;
  readonly onExport: () => void;
  readonly onImport: (file: File) => void;
  readonly onReset: () => void;
};

// Input file ẩn trong nhãn trông như nút; reset value để chọn lại cùng file vẫn kích hoạt onChange
function FileButton({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file) onFile(file);
  };
  return (
    <label className={`${btnCls} relative cursor-pointer overflow-hidden`}>
      {label}
      <input
        type="file"
        accept={accept}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={onChange}
      />
    </label>
  );
}

export function EditorToolbar(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <FileButton
        label="Tải ảnh sơ đồ"
        accept="image/jpeg,image/png,image/webp"
        onFile={props.onImage}
      />
      <label className="flex items-center gap-1 text-sm">
        Độ mờ ảnh
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.opacity}
          onChange={(e) => props.onOpacity(Number(e.currentTarget.value))}
        />
      </label>
      <button
        type="button"
        className={props.drawing ? activeCls : btnCls}
        onClick={props.onToggleDraw}
      >
        {props.drawing ? "Đang vẽ liên tục — bấm để dừng" : "Vẽ section"}
      </button>
      <button
        type="button"
        className={btnCls}
        disabled={props.detecting || !props.hasImage}
        title={props.hasImage ? undefined : "Hãy tải ảnh sơ đồ trước"}
        onClick={props.onAutoDetect}
      >
        {props.detecting ? "Đang nhận diện…" : "Tự nhận diện từ ảnh"}
      </button>
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={props.useOcr}
          onChange={(e) => props.onUseOcr(e.currentTarget.checked)}
        />
        Đọc tên (OCR)
      </label>
      <button type="button" className={btnCls} onClick={props.onExport}>
        Xuất venue.json
      </button>
      <FileButton
        label="Nhập venue.json"
        accept="application/json,.json"
        onFile={props.onImport}
      />
      <button type="button" className={btnCls} onClick={props.onReset}>
        Xoá hết
      </button>
      <output className="ml-auto text-sm text-zinc-500">{props.status}</output>
    </div>
  );
}
