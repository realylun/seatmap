"use client";

// Panel bên phải (port panel.js): danh sách section + form cấu hình section đang chọn.
import type { SectionConfig, Venue } from "@/domain/venue/types";
import { FIELDS, formatField, parseField, type FieldDef } from "./section-form";

const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const smallBtnCls =
  "rounded border border-zinc-300 px-2 py-0.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

type ListProps = {
  readonly sections: readonly SectionConfig[];
  readonly venue: Venue;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
};

export function SectionList({
  sections,
  venue,
  selectedId,
  onSelect,
}: ListProps) {
  const seatCount = new Map(
    venue.sections.map((s) => [
      s.id,
      s.rows.reduce((n, r) => n + r.seats.length, 0),
    ]),
  );
  const total = [...seatCount.values()].reduce((a, b) => a + b, 0);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        Sections ({sections.length}) · {total.toLocaleString("vi-VN")} ghế
      </h3>
      <ul className="mb-4 max-h-56 overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
        {sections.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`flex w-full justify-between border-b border-zinc-100 px-3 py-1.5 text-left text-sm dark:border-zinc-800 ${
                s.id === selectedId
                  ? "bg-blue-100 dark:bg-blue-950"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              <span>{s.id}</span>
              <small className="text-zinc-500">
                {s.rowCount} row · {seatCount.get(s.id) ?? 0} ghế
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldInput({
  field,
  section,
  onChange,
}: {
  field: FieldDef;
  section: SectionConfig;
  onChange: (patch: Partial<SectionConfig>) => void;
}) {
  const apply = (raw: string) => {
    const patch = parseField(field, raw);
    if (patch) onChange(patch);
  };
  // Đổi tên áp dụng khi gõ xong (blur / Enter) để không đổi id liên tục từng ký tự
  const isId = field.key === "id";
  return (
    <label className="mb-2 flex flex-col gap-0.5 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{field.label}</span>
      <input
        className={inputCls}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        step={field.step}
        defaultValue={formatField(field, section)}
        onChange={isId ? undefined : (e) => apply(e.currentTarget.value)}
        onBlur={isId ? (e) => apply(e.currentTarget.value) : undefined}
        onKeyDown={
          isId
            ? (e) => e.key === "Enter" && apply(e.currentTarget.value)
            : undefined
        }
      />
    </label>
  );
}

type FormProps = {
  readonly section: SectionConfig | undefined;
  readonly onChange: (patch: Partial<SectionConfig>) => void;
  readonly onDelete: (id: string) => void;
};

const ID_FIELD = FIELDS.filter((f) => f.key === "id");

function DeleteButton({
  id,
  onDelete,
}: {
  id: string;
  onDelete: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="mt-2 rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
      onClick={() => onDelete(id)}
    >
      Xoá section
    </button>
  );
}

// Khu nhập từ SVG có ghế đặt tay: tham số sinh row không có tác dụng → chỉ cho đổi tên
function ExplicitSectionForm({
  section,
  onChange,
  onDelete,
}: FormProps & { section: SectionConfig }) {
  const rows = section.explicitRows ?? [];
  const seats = rows.reduce((n, r) => n + r.seats.length, 0);
  const convert = () => {
    const ok = window.confirm(
      `Bỏ ${seats} ghế đặt tay của ${section.id} và sinh ghế tự động theo tham số row?`,
    );
    if (ok)
      onChange({ explicitRows: undefined, rowCount: Math.max(1, rows.length) });
  };
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Cấu hình {section.id}</h3>
      <p className="mb-3 rounded bg-blue-50 px-2 py-1 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-300">
        Ghế từ SVG: {rows.length} row · {seats} ghế. Sửa vị trí ghế trong file
        SVG rồi nhập lại.
      </p>
      {ID_FIELD.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          section={section}
          onChange={onChange}
        />
      ))}
      <button type="button" className={smallBtnCls} onClick={convert}>
        Chuyển sang sinh tự động
      </button>
      <div>
        <DeleteButton id={section.id} onDelete={onDelete} />
      </div>
    </div>
  );
}

export function SectionForm({ section, onChange, onDelete }: FormProps) {
  if (!section) {
    return (
      <p className="text-sm text-zinc-500">
        Chọn một section trên bản đồ hoặc trong danh sách để cấu hình.
      </p>
    );
  }
  if (section.explicitRows)
    return (
      <ExplicitSectionForm
        section={section}
        onChange={onChange}
        onDelete={onDelete}
      />
    );
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Cấu hình {section.id}</h3>
      <div className="mb-3 flex items-center gap-1.5 text-sm">
        <span className="flex-1 text-zinc-600 dark:text-zinc-400">
          Cạnh trước (row A, vạch đỏ)
        </span>
        <button
          type="button"
          className={smallBtnCls}
          title="Cạnh trước"
          onClick={() => onChange({ frontEdge: section.frontEdge - 1 })}
        >
          ◀
        </button>
        <button
          type="button"
          className={smallBtnCls}
          title="Cạnh sau"
          onClick={() => onChange({ frontEdge: section.frontEdge + 1 })}
        >
          ▶
        </button>
      </div>
      {FIELDS.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          section={section}
          onChange={onChange}
        />
      ))}
      <label className="mb-2 flex flex-col gap-0.5 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Đánh số ghế</span>
        <select
          className={inputCls}
          value={section.numbering}
          onChange={(e) =>
            onChange({
              numbering: e.currentTarget.value === "rtl" ? "rtl" : "ltr",
            })
          }
        >
          <option value="ltr">Trái → phải</option>
          <option value="rtl">Phải → trái</option>
        </select>
      </label>
      <DeleteButton id={section.id} onDelete={onDelete} />
    </div>
  );
}
