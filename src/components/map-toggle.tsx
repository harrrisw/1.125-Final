"use client";

import { useState } from "react";
import { PlacesMap, type MapPlace } from "@/components/places-map";

export function MapToggle({ places, label }: { places: MapPlace[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (places.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start rounded-full border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-sand"
      >
        {open ? "Hide map" : places.length === 1 ? "Show on a map" : `Show all ${places.length} on a map`}
      </button>
      {open && <PlacesMap places={places} label={label} />}
    </div>
  );
}
