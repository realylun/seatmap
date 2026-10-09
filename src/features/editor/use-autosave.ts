"use client";

// Tự lưu draft lên server sau 1.5s không thay đổi. Bỏ qua lần render đầu (state vừa nạp từ DB)
// và phản hồi của request cũ (người dùng sửa tiếp trong lúc đang lưu).
import { useEffect, useRef, useState } from "react";
import type { EditorBlock } from "@/domain/venue/types";
import type { CommandResult } from "@/server/commands/venues";

export const AUTOSAVE_DELAY_MS = 1500;
/** Dưới serverActions.bodySizeLimit (4mb, next.config.ts), chừa chỗ cho phần bọc request */
export const MAX_DRAFT_BYTES = 3.8 * 1024 * 1024;

export const draftBytes = (block: EditorBlock) =>
  new TextEncoder().encode(JSON.stringify(block)).length;

export function tooLargeMessage(bytes: number): string {
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return `Draft ${mb} MB vượt giới hạn tự lưu — hãy "Xuất venue.json" để giữ bản này`;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

export type SaveDraft = (
  templateId: string,
  block: EditorBlock,
) => Promise<CommandResult<null>>;

export function useAutosave(
  templateId: string,
  block: EditorBlock,
  save: SaveDraft,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const initial = useRef(block);
  const latest = useRef(0);

  useEffect(() => {
    if (block === initial.current) return undefined;
    setStatus({ kind: "pending" });
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      const bytes = draftBytes(block);
      if (bytes > MAX_DRAFT_BYTES) {
        setStatus({ kind: "error", message: tooLargeMessage(bytes) });
        return;
      }
      setStatus({ kind: "saving" });
      const result = await save(templateId, block).catch(
        (error: unknown): CommandResult<null> => ({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Không kết nối được máy chủ",
        }),
      );
      if (request !== latest.current) return;
      setStatus(
        result.ok
          ? { kind: "saved", at: new Date() }
          : { kind: "error", message: result.error },
      );
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [templateId, block, save]);

  return status;
}
