import { describe, expect, it } from "vitest";
import { hasCoords, mapsUrl, placeQuery, routeUrl, type PlaceRef } from "@/lib/links";

const cafe = { title: "Trident Booksellers & Cafe", venueName: null, area: "Back Bay", lat: 42.3484, lng: -71.0866 };
const library = {
  title: "Boston Public Library, Copley Square",
  venueName: "Boston Public Library, Central Library",
  address: "700 Boylston St, Boston, MA 02116",
  area: "Back Bay",
  lat: 42.3493,
  lng: -71.0782,
};
const noCoords: PlaceRef = { title: "Castle Island and Pleasure Bay loop", venueName: "Castle Island", area: "South Boston" };

describe("map links", () => {
  it("searches by venue name and address so the venue's own page comes up", () => {
    expect(placeQuery(library)).toBe("Boston Public Library, Central Library, 700 Boylston St, Boston, MA 02116");
    // Catalog addresses often stop at the town; the state is added.
    const museum = { title: "Harvard Art Museums", venueName: "Harvard Art Museums", address: "32 Quincy St, Cambridge", area: "Cambridge" };
    expect(placeQuery(museum)).toBe("Harvard Art Museums, 32 Quincy St, Cambridge, MA");

    const url = new URL(mapsUrl(cafe));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("query")).toBe("Trident Booksellers & Cafe, Back Bay, MA");
  });

  it("falls back to the area, without placing towns like Medford inside Boston", () => {
    expect(placeQuery({ title: "Skyline hike", venueName: "Middlesex Fells Reservation", area: "Medford" })).toBe(
      "Middlesex Fells Reservation, Medford, MA",
    );
    expect(placeQuery({ title: "Chinatown night food walk", venueName: "Chinatown", area: "Chinatown" })).toBe(
      "Chinatown, Boston, MA",
    );
    expect(placeQuery({ title: "Somewhere" })).toBe("Somewhere, Boston, MA");
  });

  it("gives every place a link, with or without coordinates", () => {
    expect(hasCoords(noCoords)).toBe(false);
    expect(new URL(mapsUrl(noCoords)).searchParams.get("query")).toBe("Castle Island, South Boston, MA");
  });

  it("builds a route through the stops in order", () => {
    expect(routeUrl([])).toBeNull();
    expect(routeUrl([cafe])).toBe(mapsUrl(cafe));

    // By name and address: bare coordinates snap to the nearest business.
    const url = new URL(routeUrl([cafe, noCoords, library]) as string);
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("Trident Booksellers & Cafe, Back Bay, MA");
    expect(url.searchParams.get("waypoints")).toBe("Castle Island, South Boston, MA");
    expect(url.searchParams.get("destination")).toBe(placeQuery(library));
    // Google Maps on the web has no transit route through waypoints.
    expect(url.searchParams.has("travelmode")).toBe(false);

    const twoStops = new URL(routeUrl([cafe, library]) as string);
    expect(twoStops.searchParams.get("travelmode")).toBe("transit");
    expect(twoStops.searchParams.has("waypoints")).toBe(false);
  });
});
