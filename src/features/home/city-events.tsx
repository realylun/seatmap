import { connection } from "next/server";
import { EmptyState, EventGrid } from "@/components/ui/event-card";
import { dayRange } from "@/features/home/dates";
import { getCities, getEventsByCity } from "@/server/queries/home";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

const CONTROL =
  "rounded-full border border-line bg-white px-4 py-2 text-sm text-foreground";

export async function CityEvents({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  await connection();

  const cities = await getCities();
  if (cities.length === 0) {
    return (
      <EmptyState
        title="No events on sale yet"
        hint="Events will show up here as soon as they are published."
      />
    );
  }

  const requested = first(params.city);
  const city = requested && cities.includes(requested) ? requested : cities[0];
  const date = first(params.date);
  const range = dayRange(date);
  const events = await getEventsByCity(city, range?.from, range?.to);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Events in {city}</h2>
        <form
          action="/#events-in-city"
          className="flex flex-wrap items-center gap-2"
        >
          <label className="sr-only" htmlFor="city-select">
            Location
          </label>
          <select
            id="city-select"
            name="city"
            defaultValue={city}
            className={CONTROL}
          >
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="date-filter">
            Filter by date
          </label>
          <input
            id="date-filter"
            name="date"
            type="date"
            defaultValue={range ? date : ""}
            className={CONTROL}
          />
          <button
            type="submit"
            className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-wine"
          >
            Apply
          </button>
        </form>
      </div>
      <div className="mt-6">
        {events.length === 0 ? (
          <EmptyState
            title={`No events in ${city} for that date`}
            hint="Try another day or clear the date filter."
          />
        ) : (
          <EventGrid events={events} />
        )}
      </div>
    </>
  );
}
