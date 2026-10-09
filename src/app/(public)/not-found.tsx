import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function PublicNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl text-accent">404</p>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
        We could not find that page
      </h1>
      <p className="mt-3 text-muted">
        The event may have ended or the link is wrong.
      </p>
      <Link
        href="/search"
        className="mt-8 inline-block rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-wine"
      >
        Browse events
      </Link>
    </main>
  );
}
