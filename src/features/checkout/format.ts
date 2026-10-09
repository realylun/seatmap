import { APP_TIME_ZONE } from "@/features/home/dates";

const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Thu, Oct 15, 7:00 PM" theo múi giờ ứng dụng */
export function formatEventDateTime(value: Date | string): string {
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}
/** Số ms còn lại → "mm:ss" (không âm) */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
