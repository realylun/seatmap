import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
export const btnCls =
  "rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";
export const btnGhostCls =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
export const linkCls = "text-blue-600 hover:underline dark:text-blue-400";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-300 dark:border-zinc-700">
          {head.map((h) => (
            <th key={h} className="px-2 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export const Td = ({ children }: { children: ReactNode }) => (
  <td className="border-b border-zinc-200 px-2 py-2 align-top dark:border-zinc-800">
    {children}
  </td>
);

export const Loading = () => <p className="text-sm text-zinc-500">Loading…</p>;

export const formatDateTime = (d: Date) =>
  d.toISOString().slice(0, 16).replace("T", " ");
export const formatVnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
