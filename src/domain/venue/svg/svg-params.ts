// data-* trên khu → tham số sinh row (dùng khi khu không vẽ ghế, hoặc để hiển thị trong editor).
import { numberingSchema, type SectionConfig } from "../types";

export type SectionParams = Partial<
  Pick<
    SectionConfig,
    | "rowCount"
    | "rowStart"
    | "rowSkip"
    | "seatsPerRow"
    | "seatSpacing"
    | "numbering"
    | "frontEdge"
    | "overrides"
  >
>;

type Parsed = { readonly params: SectionParams; readonly errors: string[] };

// Chặn giá trị vô lý (vd. data-rows="100000" làm treo việc sinh row)
export const MAX_PARAM_ROWS = 200;
export const MAX_PARAM_SEATS_PER_ROW = 500;

const isInt = (text: string, min: number, max = Number.MAX_SAFE_INTEGER) =>
  /^-?\d+$/.test(text) && Number(text) >= min && Number(text) <= max;

type Rule = (value: string) => SectionParams | string;

const RULES: Readonly<Record<string, Rule>> = {
  rows: (v) =>
    isInt(v, 0, MAX_PARAM_ROWS)
      ? { rowCount: Number(v) }
      : `data-rows phải là số nguyên 0…${MAX_PARAM_ROWS}`,
  "row-start": (v) => (v ? { rowStart: v } : "data-row-start không được rỗng"),
  "row-skip": (v) => ({
    rowSkip: v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }),
  "seats-per-row": (v) =>
    isInt(v, 0, MAX_PARAM_SEATS_PER_ROW)
      ? { seatsPerRow: Number(v) }
      : `data-seats-per-row phải là số nguyên 0…${MAX_PARAM_SEATS_PER_ROW}`,
  "seat-spacing": (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0
      ? { seatSpacing: Number(v) }
      : "data-seat-spacing phải là số dương",
  numbering: (v) => {
    const parsed = numberingSchema.safeParse(v);
    return parsed.success
      ? { numbering: parsed.data }
      : 'data-numbering phải là "ltr" hoặc "rtl"';
  },
  "front-edge": (v) =>
    isInt(v, Number.MIN_SAFE_INTEGER)
      ? { frontEdge: Number(v) }
      : "data-front-edge phải là số nguyên (chỉ số cạnh)",
  overrides: (v) => ({ overrides: v }),
};

export function sectionParams(data: Readonly<Record<string, string>>): Parsed {
  return Object.entries(RULES).reduce<Parsed>(
    (acc, [key, rule]) => {
      if (data[key] === undefined) return acc;
      const result = rule(data[key]);
      return typeof result === "string"
        ? { ...acc, errors: [...acc.errors, result] }
        : { ...acc, params: { ...acc.params, ...result } };
    },
    { params: {}, errors: [] },
  );
}
