"use client";

import { btnCls } from "./_components/ui";

export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-4 text-sm text-red-600">{error.message}</p>
      <button className={btnCls} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
