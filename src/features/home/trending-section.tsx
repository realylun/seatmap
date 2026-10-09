import { connection } from "next/server";
import { TrendingCarousel } from "@/features/home/trending-carousel";
import { getTrendingEvents } from "@/server/queries/home";

export async function TrendingSection() {
  // Defer to request time so the build never needs database access.
  await connection();
  const events = await getTrendingEvents();
  return <TrendingCarousel events={events} />;
}
