/** Events are sold in Vietnam; render and filter every date in this zone. */
export const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";
const APP_UTC_OFFSET_HOURS = 7;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const monthDay = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
});

export function formatEventDate(iso: string): string {
  return monthDay.format(new Date(iso));
}

export function formatEventLine(iso: string, venueName: string): string {
  return `${formatEventDate(iso)} · ${venueName}`;
}

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/** Half-open ISO range covering one calendar day (YYYY-MM-DD) in the app zone. */
export function dayRange(
  date: string | undefined,
): { from: string; to: string } | undefined {
  if (!date || !DATE_INPUT.test(date)) return undefined;
  const start = Date.parse(`${date}T00:00:00+07:00`);
  if (Number.isNaN(start)) return undefined;
  return {
    from: new Date(start).toISOString(),
    to: new Date(start + DAY_MS).toISOString(),
  };
}

/** Friday 00:00 to Monday 00:00 (app zone) of the current or upcoming weekend. */
export function upcomingWeekendRange(now: Date): { from: string; to: string } {
  const local = new Date(now.getTime() + APP_UTC_OFFSET_HOURS * HOUR_MS);
  const dow = local.getUTCDay();
  const daysSinceFriday = dow === 6 ? 1 : dow === 0 ? 2 : 0;
  const daysUntilFriday = dow >= 1 && dow <= 5 ? 5 - dow : 0;
  const offsetDays = daysUntilFriday - daysSinceFriday;
  const startOfToday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    APP_UTC_OFFSET_HOURS * HOUR_MS;
  const friday = startOfToday + offsetDays * DAY_MS;
  return {
    from: new Date(friday).toISOString(),
    to: new Date(friday + 3 * DAY_MS).toISOString(),
  };
}

export function currentWeekendRange(): { from: string; to: string } {
  return upcomingWeekendRange(new Date());
}
