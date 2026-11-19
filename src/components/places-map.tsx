"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPlace {
  id: string;
  /** Shown on the pin, and matched by the same number in the list next to the map. */
  label: string;
  title: string;
  subtitle?: string | null;
  lat: number;
  lng: number;
  /** Where the popup's link goes: the place in a full map app. */
  href?: string | null;
}

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/**
 * A small map with one numbered pin per place. `connect` draws a line through
 * the places in order, for a plan with several stops. The map is an extra: the
 * same places are always listed as text next to it.
 */
export function PlacesMap({
  places,
  connect = false,
  label = "Map of these places",
}: {
  places: MapPlace[];
  connect?: boolean;
  label?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Re-draw only when the pins themselves change, not on every parent render.
  const signature = JSON.stringify(places.map((p) => [p.id, p.label, p.title, p.lat, p.lng, p.href]));

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !container.current || places.length === 0) return;

      const map = L.map(container.current, { scrollWheelZoom: false });
      remove = () => map.remove();
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

      const points = places.map((p) => L.latLng(p.lat, p.lng));
      if (connect && points.length > 1) {
        L.polyline(points, { color: "#a8401d", weight: 3, opacity: 0.8, dashArray: "6 8" }).addTo(map);
      }

      for (const place of places) {
        // Built as elements, never as HTML strings: titles come from venues and other users.
        const pin = document.createElement("span");
        pin.className = "offhours-pin";
        pin.textContent = place.label;

        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = place.title;
        popup.append(name);
        if (place.subtitle) {
          const sub = document.createElement("div");
          sub.textContent = place.subtitle;
          popup.append(sub);
        }
        if (place.href) {
          const link = document.createElement("a");
          link.href = place.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open in Google Maps";
          popup.append(link);
        }

        L.marker([place.lat, place.lng], {
          icon: L.divIcon({ className: "", html: pin, iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: place.title,
          alt: `${place.label}. ${place.title}`,
        })
          .addTo(map)
          .bindPopup(popup);
      }

      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `places`.
  }, [signature, connect]);

  if (places.length === 0) return null;
  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      // `isolate` keeps the map's own layers under the page's sticky elements.
      className="isolate h-72 w-full overflow-hidden rounded-2xl border border-line bg-sand"
    />
  );
}
