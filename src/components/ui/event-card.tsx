import Image from "next/image";
import Link from "next/link";
import { HeartButton } from "@/components/ui/heart-button";
import { formatEventLine } from "@/features/home/dates";
import { isOptimizableImage } from "@/features/home/image-url";

export type EventCardData = {
  slug: string;
  name: string;
  startsAt: string;
  venueName: string;
  imageUrl: string | null;
};

type Tone = "dark" | "light";

const SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 50vw";

export function EventCard({
  event,
  tone = "light",
  priority = false,
}: {
  event: EventCardData;
  tone?: Tone;
  priority?: boolean;
}) {
  const nameColor = tone === "dark" ? "text-white" : "text-foreground";
  const metaColor = tone === "dark" ? "text-white/60" : "text-muted";

  return (
    <article className="group relative min-w-0">
      <Link
        href={`/events/${event.slug}`}
        data-testid="event-card"
        className="block rounded-xl"
        aria-label={`${event.name}, ${formatEventLine(event.startsAt, event.venueName)}`}
      >
        <div className="relative aspect-5/3 overflow-hidden rounded-xl bg-linear-to-br from-wine to-ink">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt=""
              fill
              sizes={SIZES}
              priority={priority}
              unoptimized={!isOptimizableImage(event.imageUrl)}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center font-display text-4xl text-accent/70"
            >
              {event.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <h3
          className={`mt-3 line-clamp-2 text-base leading-snug font-bold ${nameColor}`}
        >
          {event.name}
        </h3>
        <p className={`mt-1 truncate text-sm ${metaColor}`}>
          {formatEventLine(event.startsAt, event.venueName)}
        </p>
      </Link>
      <HeartButton slug={event.slug} name={event.name} />
    </article>
  );
}

export function EventGrid({
  events,
  tone,
}: {
  events: readonly EventCardData[];
  tone?: Tone;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
      {events.map((event) => (
        <li key={event.slug} className="min-w-0">
          <EventCard event={event} tone={tone} />
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  title,
  hint,
  tone = "light",
}: {
  title: string;
  hint?: string;
  tone?: Tone;
}) {
  const border = tone === "dark" ? "border-white/15" : "border-line";
  const text = tone === "dark" ? "text-white/60" : "text-muted";
  return (
    <div
      className={`rounded-xl border border-dashed px-6 py-12 text-center ${border}`}
    >
      <p className="text-lg font-bold">{title}</p>
      {hint ? <p className={`mt-1 text-sm ${text}`}>{hint}</p> : null}
    </div>
  );
}
