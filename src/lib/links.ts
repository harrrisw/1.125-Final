import { COMMUNITY } from "@/lib/config";

/**
 * Links out to a map for a place. Every idea gets one, whether or not the
 * venue has a website, so nothing is offered without a way to find it.
 */

export interface PlaceRef {
  title: string;
  venueName?: string | null;
  address?: string | null;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function hasCoords<T extends { lat?: number | null; lng?: number | null }>(
  place: T,
): place is T & { lat: number; lng: number } {
  return typeof place.lat === "number" && typeof place.lng === "number";
}

/** Ends with a state code, optionally followed by a ZIP: "..., MA" or "..., MA 02116". */
const ENDS_WITH_STATE = /,\s*[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/;

/**
 * Where the place is, for a map search: the street address when known,
 * otherwise the area. The area is not always in Boston (Cambridge, Medford),
 * so it gets the state rather than the city.
 */
function placeWhere(place: PlaceRef, name: string): string {
  const address = place.address?.trim();
  if (address) return ENDS_WITH_STATE.test(address) ? address : `${address}, ${COMMUNITY.state}`;
  const area = place.area?.trim();
  if (!area) return COMMUNITY.region;
  // "Chinatown, Chinatown, MA" reads oddly; the name already says it.
  if (name.toLowerCase().includes(area.toLowerCase())) return COMMUNITY.region;
  return `${area}, ${COMMUNITY.state}`;
}

/** What to type into a map search to find this place: its name and where it is. */
export function placeQuery(place: PlaceRef): string {
  const name = place.venueName?.trim() || place.title.trim();
  return [name, placeWhere(place, name)].filter(Boolean).join(", ");
}

/** Opens the place in Google Maps, by name so the venue's own page comes up. */
export function mapsUrl(place: PlaceRef): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery(place))}`;
}

/** A point for a route: exact coordinates when known, otherwise the name search. */
function routePoint(place: PlaceRef): string {
  return hasCoords(place) ? `${place.lat},${place.lng}` : placeQuery(place);
}

/**
 * Opens Google Maps with the stops as one route, in order. With a single stop
 * this is just the place. Google accepts at most nine waypoints between the
 * first and last stop; plans are capped below that.
 */
export function routeUrl(stops: PlaceRef[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return mapsUrl(stops[0]);
  const params = new URLSearchParams({
    api: "1",
    origin: routePoint(stops[0]),
    destination: routePoint(stops[stops.length - 1]),
    travelmode: "transit",
  });
  const between = stops.slice(1, -1).map(routePoint);
  if (between.length > 0) params.set("waypoints", between.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
