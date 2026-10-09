import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { formatEventDateTime } from "@/features/checkout/format";
import { SeatLines } from "@/features/checkout/SeatLines";
import { readSessionId } from "@/lib/session";
import { getOrderSummary } from "@/server/queries/event-detail";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false },
};

type Params = PageProps<"/orders/[id]">["params"];

/** Chỉ session đã mua mới xem được chi tiết đơn */
async function OrderContent({ params }: { params: Params }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [sessionId, order] = await Promise.all([
    readSessionId(),
    getOrderSummary(id),
  ]);
  if (!order || !sessionId || order.sessionId !== sessionId) notFound();

  return (
    <article className="rounded-xl border border-line p-6">
      <p className="text-sm font-semibold text-emerald-700">
        Payment confirmed
      </p>
      <h1 className="mt-1 text-2xl font-bold">
        You&apos;re going to {order.eventName}!
      </h1>
      <p className="text-muted">
        {formatEventDateTime(order.startsAt)} · {order.venueName}, {order.city}
      </p>
      <dl className="my-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted">Order</dt>
        <dd className="font-mono" data-testid="order-id">
          {order.id}
        </dd>
        <dt className="text-muted">Name</dt>
        <dd>{order.buyerName}</dd>
        <dt className="text-muted">Email</dt>
        <dd>{order.buyerEmail}</dd>
        <dt className="text-muted">Placed</dt>
        <dd>{formatEventDateTime(order.createdAt)}</dd>
      </dl>
      <div data-testid="order-seats">
        <SeatLines seats={order.items} total={order.total} />
      </div>
      <Link
        href={`/events/${order.eventSlug}`}
        className="mt-6 inline-block font-semibold text-accent hover:underline"
      >
        Back to event
      </Link>
    </article>
  );
}

// Status 404 thật không làm được trong page: với cacheComponents/PPR, layout là static shell và được
// flush ngay khi page chờ params/cookies → status đã là 200 trước khi notFound() chạy (kiểm chứng bằng
// `next start`: kể cả notFound() ngay sau `await params` vẫn trả 200). Next vẫn render UI not-found +
// <meta name="robots" content="noindex">. Muốn 404 thật phải kiểm tra trong proxy.ts (docs: loading#status-codes).

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading your order…</p>}>
        <OrderContent params={params} />
      </Suspense>
    </main>
  );
}
