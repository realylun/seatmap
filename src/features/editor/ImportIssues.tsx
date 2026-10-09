"use client";

// Danh sách lỗi / cảnh báo khi nhập SVG — hiện đủ để designer sửa file một lượt.
import type { SvgIssue } from "@/domain/venue/svg/svg-venue";

const MAX_SHOWN = 50;

type Props = {
  readonly issues: readonly SvgIssue[];
  readonly onClose: () => void;
};

export function ImportIssues({ issues, onClose }: Props) {
  if (issues.length === 0) return null;
  const errorCount = issues.filter((i) => i.level === "error").length;
  const hidden = issues.length - MAX_SHOWN;
  return (
    <section className="mb-4 rounded border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold">
          Nhập SVG: {errorCount} lỗi · {issues.length - errorCount} cảnh báo
        </h3>
        <button
          type="button"
          className="px-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Đóng"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <ul className="max-h-48 space-y-0.5 overflow-auto">
        {issues.slice(0, MAX_SHOWN).map((issue, i) => (
          <li
            key={`${i}:${issue.message}`}
            className={
              issue.level === "error"
                ? "text-red-700 dark:text-red-400"
                : "text-amber-800 dark:text-amber-300"
            }
          >
            {issue.level === "error" ? "✕" : "!"} {issue.message}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-1 text-zinc-500">… và {hidden} mục nữa</p>
      )}
    </section>
  );
}
