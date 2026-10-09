import Link from "next/link";
import { Logo } from "@/components/ui/logo";

const NAV = [
  { label: "Sports", href: "/search?category=sports" },
  { label: "Music", href: "/search?category=music" },
  { label: "Shows", href: "/search?category=shows" },
  { label: "Cities", href: "/#events-in-city" },
] as const;

export function SiteHeader() {
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
        <Logo />
        <nav
          aria-label="Primary"
          className="order-3 flex w-full gap-6 text-[15px] sm:order-none sm:w-auto"
        >
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded py-1 text-white/90 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="ml-auto rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20"
        >
          Sign in
        </button>
      </div>
    </header>
  );
}
