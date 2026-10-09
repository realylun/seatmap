"use client";

// Tự lưu draft lên server sau 1.5s không thay đổi. Bỏ qua lần render đầu (state vừa nạp từ DB)
// và phản hồi của request cũ (người dùng sửa tiếp trong lúc đang lưu).
import { useEffect, useRef, useState } from "react";
import type { EditorBlock } from "@/domain/venue/types";
import type { CommandResult } from "@/server/commands/venues";

export const AUTOSAVE_DELAY_MS = 1500;

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
