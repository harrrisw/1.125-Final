import { COMMUNITY } from "@/lib/config";

/**
 * Calendar filters ("tonight", "this weekend", a chosen date) as exact time
 * windows in the community's own timezone, whatever timezone the server is in.
 */

export const WHEN_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "tonight", label: "Tonight" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "date", label: "Pick a date" },
] as const;
export type When = (typeof WHEN_OPTIONS)[number]["value"];

export interface Window {
  from: Date;
  to: Date;
  label: string;
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function parts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday),
  };
}

/** Minutes the zone is ahead of UTC at this instant (negative for Boston). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The instant a local wall-clock time happens in the zone. */
export function zonedTime(date: LocalDate, hour: number, timeZone = COMMUNITY.timezone, minute = 0): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const first = offsetMinutes(new Date(guess), timeZone);
  let instant = guess - first * 60_000;
  // Near a daylight-saving change the offset at the answer can differ from the guess's.
  const second = offsetMinutes(new Date(instant), timeZone);
  if (second !== first) instant = guess - second * 60_000;
  return new Date(instant);
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "2026-11-22" as a local date, or null. */
export function parseDate(value: string | null | undefined): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = addDays(date, 0);
  return check.year === date.year && check.month === date.month && check.day === date.day ? date : null;
}

/**
 * A date-time picker's value ("2026-11-22T19:00") read as the community's
 * local time, whatever timezone the viewer's device is set to.
 */
export function communityTime(value: string, timeZone = COMMUNITY.timezone): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  const date = match ? parseDate(match[1]) : null;
  if (!match || !date) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  return zonedTime(date, hour, timeZone, minute);
}

export function localToday(now: Date, timeZone = COMMUNITY.timezone): string {
  const p = parts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

const dayLabel = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" }).format(instant);

const later = (a: Date, b: Date) => (a > b ? a : b);

/**
 * The window a calendar filter stands for, or null for "any time" (or a date
 * that does not parse). Windows never start before now: what is over is over.
 */
export function resolveWhen(
  when: string | null | undefined,
  date: string | null | undefined,
  now: Date,
  timeZone = COMMUNITY.timezone,
): Window | null {
  const p = parts(now, timeZone);
  const today: LocalDate = { year: p.year, month: p.month, day: p.day };
  const midnight = (d: LocalDate) => zonedTime(d, 0, timeZone);

  switch (when) {
    case "today":
      return { from: now, to: midnight(addDays(today, 1)), label: "today" };
    case "tonight": {
      // Evening into the small hours: 5 PM to 3 AM.
      const from = later(now, zonedTime(today, 17, timeZone));
      const to = zonedTime(addDays(today, 1), 3, timeZone);
      return { from, to, label: "tonight" };
    }
    case "tomorrow": {
      const tomorrow = addDays(today, 1);
      return { from: midnight(tomorrow), to: midnight(addDays(tomorrow, 1)), label: "tomorrow" };
    }
    case "weekend": {
      // Friday 5 PM to the end of Sunday. During the weekend, from now.
      const daysToFriday = (5 - p.weekday + 7) % 7;
      const friday = p.weekday === 6 ? addDays(today, -1) : p.weekday === 0 ? addDays(today, -2) : addDays(today, daysToFriday);
      const from = later(now, zonedTime(friday, 17, timeZone));
      const to = midnight(addDays(friday, 3));
      return { from, to, label: "this weekend" };
    }
    case "date": {
      const chosen = parseDate(date);
      if (!chosen) return null;
      const start = midnight(chosen);
      return { from: later(now, start), to: midnight(addDays(chosen, 1)), label: dayLabel(start, timeZone) };
    }
    default:
      return null;
  }
}

/** Whether a dated thing starts inside the window. */
export function startsWithin(startsAt: string | null, window: Window): boolean {
  if (!startsAt) return false;
  const t = new Date(startsAt).getTime();
  return t >= window.from.getTime() && t < window.to.getTime();
}

/** Whether the window covers right now, which is when a shared mood applies. */
export function coversNow(window: Window, now: Date): boolean {
  return window.from.getTime() <= now.getTime() && now.getTime() < window.to.getTime();
}
