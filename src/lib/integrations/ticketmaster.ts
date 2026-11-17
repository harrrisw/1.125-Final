import { COMMUNITY } from "@/lib/config";
import type { ActivityInput, ActivitySource } from "@/lib/integrations/sources";

/**
 * Dated events from the Ticketmaster Discovery API.
 *
 * NOT YET RUN AGAINST THE LIVE API. The request and response shapes follow the
 * Discovery v2 documentation; check one real response before relying on it.
 * Needs TICKETMASTER_API_KEY.
 */

const ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json";
const DAYS_AHEAD = 14;

/** Rough mood attributes by event segment, until an LLM tagger replaces this. */
const SEGMENT_PROFILE: Record<string, { energy: number; noise: number; duration: number }> = {
  Music: { energy: 4, noise: 4, duration: 150 },
  Sports: { energy: 4, noise: 4, duration: 180 },
  "Arts & Theatre": { energy: 2, noise: 2, duration: 150 },
  Film: { energy: 1, noise: 2, duration: 120 },
};
const DEFAULT_PROFILE = { energy: 3, noise: 3, duration: 120 };

interface TicketmasterEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  dates?: { start?: { dateTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  _embedded?: {
    venues?: {
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

/** Discovery wants second precision with a Z suffix: 2026-11-21T19:00:00Z. */
const stamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function mapTicketmasterEvent(event: TicketmasterEvent): ActivityInput | null {
  const startsAt = event.dates?.start?.dateTime;
  if (!startsAt) return null;

  const segment = event.classifications?.[0]?.segment?.name;
  const genre = event.classifications?.[0]?.genre?.name;
  const venue = event._embedded?.venues?.[0];
  const profile = (segment && SEGMENT_PROFILE[segment]) || DEFAULT_PROFILE;
  const lat = venue?.location?.latitude ? Number(venue.location.latitude) : undefined;
  const lng = venue?.location?.longitude ? Number(venue.location.longitude) : undefined;

  return {
    source: "ticketmaster",
    externalId: event.id,
    title: event.name,
    description: event.info,
    category: segment,
    tags: [segment, genre].filter((t): t is string => Boolean(t) && t !== "Undefined"),
    venueName: venue?.name,
    address: venue?.address?.line1,
    area: venue?.city?.name,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    isPublicVenue: true,
    startsAt,
    durationMinutes: profile.duration,
    energy: profile.energy,
    noise: profile.noise,
    groupFit: ["solo", "small_group", "open"],
    url: event.url,
  };
}

export const ticketmasterSource: ActivitySource = {
  name: "ticketmaster",
  enabled: () => Boolean(process.env.TICKETMASTER_API_KEY),
  async fetch() {
    const now = new Date();
    const params = new URLSearchParams({
      apikey: process.env.TICKETMASTER_API_KEY ?? "",
      latlong: `${COMMUNITY.center.lat},${COMMUNITY.center.lng}`,
      radius: String(COMMUNITY.radiusKm),
      unit: "km",
      startDateTime: stamp(now),
      endDateTime: stamp(new Date(now.getTime() + DAYS_AHEAD * 86_400_000)),
      size: "100",
      sort: "date,asc",
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!res.ok) throw new Error(`Ticketmaster request failed (${res.status})`);
    const json = (await res.json()) as { _embedded?: { events?: TicketmasterEvent[] } };

    return (json._embedded?.events ?? [])
      .map(mapTicketmasterEvent)
      .filter((a): a is ActivityInput => a !== null);
  },
};
