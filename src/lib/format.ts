import { COMMUNITY } from "@/lib/config";

/** "Sat 2:00 PM" in the pilot community's timezone, the same on server and client. */
export function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMMUNITY.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMMUNITY.timezone,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
