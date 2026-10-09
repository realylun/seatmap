"use client";

import Link from "next/link";

export default function PublicError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 text-muted">
        We could not load this page. Please try again.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-wine"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-line px-5 py-3 text-sm font-bold transition-colors hover:border-ink"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
