import { Suspense } from "react";
import { CityEvents } from "@/features/home/city-events";
import { Hero } from "@/features/home/hero";
import { RecentlyViewedSection } from "@/features/home/recently-viewed-section";
import { CardsSkeleton } from "@/features/home/section-skeleton";
import { TrendingSection } from "@/features/home/trending-section";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <main>
      <div className="hero-surface pb-16">
        <Hero />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Suspense fallback={<CardsSkeleton dark />}>
            <TrendingSection />
          </Suspense>
        </div>
      </div>

      <section
        id="events-in-city"
        className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 sm:px-6"
      >
        <Suspense fallback={<CardsSkeleton />}>
          <CityEvents searchParams={searchParams} />
        </Suspense>
      </section>

      <RecentlyViewedSection />
    </main>
  );
}
