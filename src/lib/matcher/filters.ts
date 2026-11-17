import type { Candidate } from "@/lib/types";

/** Hard filters: options that fail these are never scored or shown. */

export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface FilterOptions {
  window: TimeWindow;
  center: LatLng;
  radiusKm: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Undated places always pass. Dated events must start inside the window. */
export function withinWindow(c: Candidate, window: TimeWindow): boolean {
  if (c.startsAt === null) return true;
  const start = new Date(c.startsAt).getTime();
  return start >= window.from.getTime() && start <= window.to.getTime();
}

/** Options with no coordinates pass: we would rather show than silently drop them. */
export function withinRadius(c: Candidate, center: LatLng, radiusKm: number): boolean {
  if (c.lat === null || c.lng === null) return true;
  return haversineKm(center, { lat: c.lat, lng: c.lng }) <= radiusKm;
}

export function hasRoom(c: Candidate): boolean {
  if (c.kind !== "open_plan" || !c.plan || c.plan.capacity === null) return true;
  return c.plan.goingCount < c.plan.capacity;
}

export function applyHardFilters(candidates: Candidate[], opts: FilterOptions): Candidate[] {
  return candidates.filter(
    (c) =>
      withinWindow(c, opts.window) &&
      withinRadius(c, opts.center, opts.radiusKm) &&
      hasRoom(c),
  );
}

const MAX_WINDOW_DAYS = 14;
const DEFAULT_WINDOW_HOURS = 4;

/**
 * Turns the agent's optional from/to into a safe window. The agent is told the
 * current local time each turn and passes ISO timestamps, so there is no
 * timezone arithmetic here.
 */
export function resolveWindow(
  input: { from?: string; to?: string },
  now: Date,
  timeBudgetMinutes: number | null,
): TimeWindow {
  const parsedFrom = input.from ? new Date(input.from) : null;
  const from =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) && parsedFrom > now ? parsedFrom : now;

  const defaultSpanMs = Math.max(
    DEFAULT_WINDOW_HOURS * 3_600_000,
    (timeBudgetMinutes ?? 0) * 60_000,
  );
  const parsedTo = input.to ? new Date(input.to) : null;
  let to =
    parsedTo && !Number.isNaN(parsedTo.getTime()) && parsedTo > from
      ? parsedTo
      : new Date(from.getTime() + defaultSpanMs);

  const maxTo = new Date(from.getTime() + MAX_WINDOW_DAYS * 86_400_000);
  if (to > maxTo) to = maxTo;
  return { from, to };
}
