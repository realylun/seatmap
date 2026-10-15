import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatEventDateTime } from "@/features/checkout/format";
import { isOptimizableImage } from "@/features/home/image-url";
import { EventExplorer } from "@/features/seatmap/EventExplorer";
import {
  getEventBySlug,
  type EventDetail,
} from "@/server/queries/event-detail";

async function loadEvent(params: PageProps<"/events/[slug]">["params"]) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "draft") notFound();
  return event;
}

export async function generateMetadata({
  params,
}: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "draft") return { title: "Event not found" };
  const description = `${formatEventDateTime(event.startsAt)} · ${event.venueName}, ${event.city}. Pick your seats and get tickets.`;
  const images = event.imageUrl
    ? [{ url: event.imageUrl, alt: event.name }]
    : [];
  return {
    title: event.name,
    description,
    openGraph: {
      type: "website",
      title: event.name,
      description,
      url: `/events/${event.slug}`,
      images,
    },
    twitter: {
      card: event.imageUrl ? "summary_large_image" : "summary",
      title: event.name,
      description,
      images: images.map((i) => i.url),
    },
  };
}

function EventHeader({ event }: { event: EventDetail }) {
  return (
    <div className="bg-[linear-gradient(90deg,var(--ink),var(--wine))] text-white">
      <div className="flex items-center gap-4 px-4 py-3 sm:px-6">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-wine">
          {event.imageUrl && (
            <Image
              src={event.imageUrl}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
              unoptimized={!isOptimizableImage(event.imageUrl)}
            />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-wide uppercase">
            {event.name}
          </h1>
          <p className="truncate text-sm text-white/75">
            {formatEventDateTime(event.startsAt)} · {event.venueName},{" "}
            {event.city}
          </p>
        </div>
        {event.status === "ended" && (
          <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            Ended
          </span>
        )}
      </div>
    </div>
  );
}

// Status 404 thật không làm được trong page: với cacheComponents/PPR, layout là static shell và được
// flush ngay khi page chờ params/cookies → status đã là 200 trước khi notFound() chạy (kiểm chứng bằng
// `next start`: kể cả notFound() ngay sau `await params` vẫn trả 200). Next vẫn render UI not-found +
// <meta name="robots" content="noindex">. Muốn 404 thật phải kiểm tra trong proxy.ts (docs: loading#status-codes).
async function EventContent({
  params,
}: {
  params: PageProps<"/events/[slug]">["params"];
}) {
  const event = await loadEvent(params);
  return (
    <>
      <EventHeader event={event} />
      <EventExplorer
        eventId={event.id}
        geometryUrl={event.geometryUrl}
        overviewUrl={event.overviewUrl}
        canBuy={event.status === "on_sale"}
        viewed={{
          slug: event.slug,
          name: event.name,
          startsAt: event.startsAt,
          venueName: event.venueName,
          imageUrl: event.imageUrl,
        }}
      />
    </>
  );
}

function EventSkeleton() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="h-[72px] bg-ink" />
      <div className="h-[60vh] bg-[#eef0f6]" />
    </div>
  );
}

export default function EventPage({ params }: PageProps<"/events/[slug]">) {
  return (
    <main>
      <Suspense fallback={<EventSkeleton />}>
        <EventContent params={params} />
      </Suspense>
    </main>
  );
}
