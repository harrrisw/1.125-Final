/**
 * Calendar integration.
 *
 * Today: a prefilled Google Calendar link. It needs no OAuth and the user
 * saves the event themselves, so it is safe as a first version.
 *
 * TODO (midpoint milestone, "calendar sync"): Google OAuth with the
 * calendar.events scope, store the refresh token encrypted in calendar_links,
 * and insert the event server-side after the confirm gate passes.
 */

export interface CalendarEvent {
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string;
}

/** 2026-11-21T19:00:00-05:00 -> 20261122T000000Z */
function compactUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function calendarTemplateUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compactUtc(event.starts_at)}/${compactUtc(event.ends_at)}`,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
