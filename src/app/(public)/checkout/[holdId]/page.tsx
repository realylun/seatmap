import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { CheckoutForm } from "@/features/checkout/CheckoutForm";
import { Countdown } from "@/features/checkout/Countdown";
import { formatEventDateTime } from "@/features/checkout/format";
import { SeatLines } from "@/features/checkout/SeatLines";
import { readSessionId } from "@/lib/session";
import { releaseHoldAction } from "@/server/actions/holds";
import {
  getHoldSummary,
  type HoldSummary,
} from "@/server/queries/event-detail";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

type Params = PageProps<"/checkout/[holdId]">["params"];

/** Hold phải tồn tại và thuộc session hiện tại; ngược lại 404 (không lộ hold của người khác) */
async function loadOwnHold(
  params: Params,
): Promise<{ hold: HoldSummary; active: boolean }> {
  const { holdId } = await params;
  if (!z.uuid().safeParse(holdId).success) notFound();
  const [sessionId, hold] = await Promise.all([
    readSessionId(),
    getHoldSummary(holdId),
  ]);
  if (!hold || !sessionId || hold.sessionId !== sessionId) notFound();
  const active =
    hold.status === "active" &&
    hold.expiresAt.getTime() > Date.now() &&
    hold.seats.length > 0;
  return { hold, active };
}

function HoldClosed({ hold }: { hold: HoldSummary }) {
  const message =
    hold.status === "converted"
      ? "This hold has already been paid."
      : "This hold has expired or was cancelled. The seats have been released.";
  return (
    <div className="rounded-xl border border-line p-6 text-center">
      <p className="mb-4">{message}</p>
      <Link
        href={`/events/${hold.eventSlug}`}
        className="inline-block rounded-lg bg-ink px-5 py-2.5 font-semibold text-white"
      >
        Back to event
      </Link>
    </div>
  );
}

async function CheckoutContent({ params }: { params: Params }) {
  const { hold, active } = await loadOwnHold(params);
  const total = hold.seats.reduce((sum, s) => sum + s.price, 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{hold.eventName}</h1>
        <p className="text-muted">
          {formatEventDateTime(hold.startsAt)} · {hold.venueName}, {hold.city}
        </p>
      </header>
      {!active ? (
        <HoldClosed hold={hold} />
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_minmax(280px,360px)]">
          <section aria-labelledby="seats-heading" className="space-y-4">
            <Countdown expiresAt={hold.expiresAt.toISOString()} />
            <h2 id="seats-heading" className="text-lg font-bold">
              Your seats
            </h2>
            <SeatLines seats={hold.seats} total={total} />
            <form action={releaseHoldAction.bind(null, hold.id)}>
              <button
                type="submit"
                className="text-sm font-semibold text-muted underline hover:text-foreground"
              >
                Cancel hold and release seats
              </button>
            </form>
          </section>
          <section
            aria-labelledby="buyer-heading"
            className="rounded-xl border border-line p-5"
          >
            <h2 id="buyer-heading" className="mb-4 text-lg font-bold">
              Buyer details
            </h2>
            <CheckoutForm holdId={hold.id} eventSlug={hold.eventSlug} />
            <p className="mt-3 text-xs text-muted">No real payment is taken.</p>
          </section>
        </div>
      )}
    </>
  );
}

// Status 404 thật không làm được trong page: với cacheComponents/PPR, layout là static shell và được
// flush ngay khi page chờ params/cookies → status đã là 200 trước khi notFound() chạy (kiểm chứng bằng
// `next start`: kể cả notFound() ngay sau `await params` vẫn trả 200). Next vẫn render UI not-found +
// <meta name="robots" content="noindex">. Muốn 404 thật phải kiểm tra trong proxy.ts (docs: loading#status-codes).

export default function CheckoutPage({
  params,
}: PageProps<"/checkout/[holdId]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading your hold…</p>}>
        <CheckoutContent params={params} />
      </Suspense>
    </main>
  );
}
