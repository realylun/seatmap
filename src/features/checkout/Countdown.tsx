"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRemaining } from "./format";

const TICK_MS = 1000;

/** Đếm ngược hạn giữ ghế; hết giờ → refresh để server render trạng thái hết hạn */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const deadline = Date.parse(expiresAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, TICK_MS);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, []);

  const expired = now !== null && now >= deadline;
  useEffect(() => {
    if (expired) router.refresh();
  }, [expired, router]);

  return (
    <p
      role="timer"
      data-testid="countdown"
      aria-live="off"
      className={`rounded-lg px-4 py-3 text-sm ${expired ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
    >
      {expired ? (
        "Your hold has expired."
      ) : (
        <>
          Seats held for{" "}
          <span className="font-mono text-base font-bold">
            {now === null ? "--:--" : formatRemaining(deadline - now)}
          </span>
        </>
      )}
    </p>
  );
}
