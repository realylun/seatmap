import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/orders", label: "Orders" },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-zinc-200 p-4 dark:border-zinc-800">
        <Link href="/admin" className="mb-6 block text-lg font-semibold">
          Seatmap Admin
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
