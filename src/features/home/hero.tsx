import Link from "next/link";

const CHIPS = [
  { label: "Popular this weekend", href: "/search?when=weekend" },
  { label: "Live music near you", href: "/search?category=music" },
  { label: "Game day tickets", href: "/search?category=sports" },
  { label: "Best shows this month", href: "/search?category=shows" },
] as const;

export function Hero() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-14 text-center sm:pt-16">
      <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
        Be good at seats
      </h1>
      <p className="mt-3 text-lg text-white/85 sm:text-xl">
        Find the best tickets at the best prices
      </p>

      <search className="mt-8 block">
        <form
          action="/search"
          className="mx-auto flex items-center gap-3 rounded-lg bg-white px-4 shadow-lg shadow-black/30 focus-within:ring-2 focus-within:ring-accent"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 shrink-0 text-ink"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <label htmlFor="hero-search" className="sr-only">
            Search events, venues or cities
          </label>
          <input
            id="hero-search"
            name="q"
            type="search"
            autoComplete="off"
            placeholder="What do you want to see live?"
            className="min-w-0 flex-1 bg-transparent py-4 text-base text-ink outline-none placeholder:text-ink/60 sm:text-lg"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-wine"
          >
            Search
          </button>
        </form>
      </search>

      <ul className="mt-6 flex flex-wrap justify-center gap-3">
        {CHIPS.map((chip) => (
          <li key={chip.label}>
            <Link
              href={chip.href}
              className="block rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-[15px] text-white transition-colors hover:bg-white/20"
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
