"use client";

// Điểm vào editor cho trang /admin/templates/[id]/edit. MapLibre / canvas / Web Worker chỉ chạy
// trên trình duyệt → tải EditorApp bằng next/dynamic với ssr: false (phải nằm trong Client Component).
import dynamic from "next/dynamic";

export type EditorTemplate = {
  id: string;
  name: string;
  editorState: unknown;
  backgroundImageUrl: string | null;
};

const EditorApp = dynamic(() => import("./EditorApp"), {
  ssr: false,
  loading: () => <p className="text-sm text-zinc-500">Đang tải editor…</p>,
});

export function EditorShell({ template }: { template: EditorTemplate }) {
  return <EditorApp template={template} />;
}
