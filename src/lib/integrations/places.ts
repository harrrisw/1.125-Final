import { COMMUNITY } from "@/lib/config";
import type { ActivityInput, ActivitySource } from "@/lib/integrations/sources";

/**
 * Undated places from the Google Places API (New), Text Search.
 *
 * NOT YET RUN AGAINST THE LIVE API. The request and field mask follow the
 * Places API (New) documentation; check one real response before relying on
 * it. Needs GOOGLE_PLACES_API_KEY.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.editorialSummary",
  "places.googleMapsUri",
].join(",");

/** What we search for, and the mood attributes each kind of place gets. */
const QUERIES: { query: string; category: string; energy: number; noise: number; duration: number }[] = [
  { query: "art museum", category: "Museum", energy: 2, noise: 1, duration: 120 },
  { query: "park with walking paths", category: "Outdoors", energy: 2, noise: 1, duration: 60 },
  { query: "quiet cafe", category: "Cafe", energy: 1, noise: 2, duration: 75 },
  { query: "independent bookstore", category: "Books", energy: 1, noise: 1, duration: 60 },
  { query: "food hall or night market", category: "Food", energy: 3, noise: 3, duration: 90 },
  { query: "bowling alley or arcade", category: "Games", energy: 4, noise: 4, duration: 120 },
];

interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  editorialSummary?: { text?: string };
  googleMapsUri?: string;
}

export function mapPlace(place: Place, kind: (typeof QUERIES)[number]): ActivityInput | null {
  const title = place.displayName?.text;
  if (!title) return null;
  return {
    source: "places",
    externalId: place.id,
    title,
    description: place.editorialSummary?.text,
    category: kind.category,
    tags: (place.types ?? []).slice(0, 6).map((t) => t.replace(/_/g, " ")),
    venueName: title,
    address: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    isPublicVenue: true,
    durationMinutes: kind.duration,
    energy: kind.energy,
    noise: kind.noise,
    groupFit: ["solo", "small_group", "open"],
    url: place.googleMapsUri,
  };
}

export const placesSource: ActivitySource = {
  name: "places",
  enabled: () => Boolean(process.env.GOOGLE_PLACES_API_KEY),
  async fetch() {
    const results = new Map<string, ActivityInput>();
    for (const kind of QUERIES) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY ?? "",
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: kind.query,
          locationBias: {
            circle: {
              center: { latitude: COMMUNITY.center.lat, longitude: COMMUNITY.center.lng },
              radius: COMMUNITY.radiusKm * 1000,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`Places request failed (${res.status}) for "${kind.query}"`);
      const json = (await res.json()) as { places?: Place[] };
      for (const place of json.places ?? []) {
        const mapped = mapPlace(place, kind);
        if (mapped && !results.has(mapped.externalId)) results.set(mapped.externalId, mapped);
      }
    }
    return [...results.values()];
  },
};
