// Định nghĩa form cấu hình section (port panel.js) + parse giá trị nhập → patch hợp lệ hoặc bỏ qua.
import type { SectionConfig } from "@/domain/venue/types";

type FieldKey =
  | "id"
  | "rowStart"
  | "rowCount"
  | "rowSkip"
  | "seatsPerRow"
  | "seatSpacing"
  | "overrides";

export type FieldDef = {
  readonly key: FieldKey;
  readonly label: string;
  readonly type: "text" | "number" | "list";
  readonly min?: number;
  readonly step?: number;
  readonly integer?: boolean;
};

export const FIELDS: readonly FieldDef[] = [
  { key: "id", label: "Tên section", type: "text" },
  { key: "rowStart", label: "Row bắt đầu (A hoặc 1)", type: "text" },
  {
    key: "rowCount",
    label: "Số row",
    type: "number",
    min: 1,
    step: 1,
    integer: true,
  },
  { key: "rowSkip", label: "Bỏ qua row (vd: I,O)", type: "list" },
  {
    key: "seatsPerRow",
    label: "Ghế mỗi row (0 = tự tính)",
    type: "number",
    min: 0,
    step: 1,
    integer: true,
  },
  {
    key: "seatSpacing",
    label: "Khoảng cách ghế",
    type: "number",
    min: 0.02,
    step: 0.01,
  },
  { key: "overrides", label: "Ghi đè số ghế (vd: A:12, B:14)", type: "text" },
];

export function formatField(field: FieldDef, section: SectionConfig): string {
  const value = section[field.key];
  return Array.isArray(value) ? value.join(",") : String(value);
}

/** Giá trị đang gõ dở / không hợp lệ → null (giữ nguyên section, giống bản gốc) */
export function parseField(
  field: FieldDef,
  raw: string,
): Partial<SectionConfig> | null {
  if (field.type === "list") {
    return {
      [field.key]: raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (field.type === "number") {
    const value = Number(raw);
    const isValid =
      raw.trim() !== "" &&
      value >= (field.min ?? 0) &&
      (!field.integer || Number.isInteger(value));
    return isValid ? { [field.key]: value } : null;
  }
  const text = raw.trim();
  const isEmpty = text === "" && field.key !== "overrides";
  // "|" là ký tự phân cách seat id → không cho dùng trong tên section / row
  const hasSeparator = field.key !== "overrides" && text.includes("|");
  return isEmpty || hasSeparator ? null : { [field.key]: text };
}
