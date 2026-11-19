"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlacesMap, type MapPlace } from "@/components/places-map";
import { formatDay, formatWhen } from "@/lib/format";
import { hasCoords, mapsUrl, routeUrl } from "@/lib/links";
import type { PlanStop, SavedPlan } from "@/lib/types";

const LINK = "font-medium text-accent underline-offset-2 hover:underline";

/** One saved plan: the stops in order, a map with a numbered pin for each, and a link for every stop. */
export function PlanView({ plan }: { plan: SavedPlan }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMap: MapPlace[] = plan.stops
    .map((stop, i) => ({ stop, number: i + 1 }))
    .filter(({ stop }) => hasCoords(stop))
    .map(({ stop, number }) => ({
      id: stop.id,
      label: String(number),
      title: stop.title,
      subtitle: [stop.area, formatWhen(stop.startsAt)].filter(Boolean).join(" · ") || null,
      lat: stop.lat as number,
      lng: stop.lng as number,
      href: mapsUrl(stop),
    }));
  const route = routeUrl(plan.stops);

  async function deletePlan() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/itineraries/${plan.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/planner");
      router.refresh();
    } else {
      setBusy(false);
      setError("The plan could not be deleted. Try again.");
    }
  }

  async function removeStop(stop: PlanStop) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/itineraries/${plan.id}/stops/${stop.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    const body = (await res?.json().catch(() => null)) as { result?: string } | null;
    if (res?.ok && body?.result === "plan_deleted") {
      router.push("/planner");
      router.refresh();
      return;
    }
    if (!res?.ok) setError("That stop could not be removed. Try again.");
    setBusy(false);
    router.refresh();
  }

  const stopsLabel = plan.stops.length === 1 ? "1 stop" : `${plan.stops.length} stops`;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-accent">
          Saved plan · {stopsLabel} · only you can see it
        </p>
        <h1 className="font-serif text-2xl font-semibold">{plan.title}</h1>
        {plan.note && <p className="mt-1 text-muted">{plan.note}</p>}
        <p className="mt-1 text-sm text-muted">Saved {formatDay(plan.createdAt)}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {route && (
            <a href={route} target="_blank" rel="noopener noreferrer" className={LINK}>
              {plan.stops.length > 1 ? "Open the route in Google Maps" : "Open in Google Maps"}
            </a>
          )}
          {confirmingDelete ? (
            <span className="flex items-center gap-3">
              <span>Delete this plan?</span>
              <button type="button" onClick={deletePlan} disabled={busy} className={`${LINK} disabled:opacity-60`}>
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="font-medium text-muted underline-offset-2 hover:underline"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="font-medium text-muted underline-offset-2 hover:underline"
            >
              Delete plan
            </button>
          )}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {onMap.length > 0 && (
        <PlacesMap places={onMap} connect label={`Map of the stops in ${plan.title}`} />
      )}

      <ol className="flex flex-col gap-2">
        {plan.stops.map((stop, i) => (
          <StopRow key={stop.id} stop={stop} number={i + 1} busy={busy} onRemove={() => removeStop(stop)} />
        ))}
      </ol>
    </div>
  );
}

function StopRow({
  stop,
  number,
  busy,
  onRemove,
}: {
  stop: PlanStop;
  number: number;
  busy: boolean;
  onRemove: () => void;
}) {
  const meta = [formatWhen(stop.startsAt), stop.area].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-card p-4">
      <span aria-hidden="true" className="offhours-pin mt-1 shrink-0">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        {meta && <p className="text-xs font-medium tracking-wide text-accent">{meta}</p>}
        <p className="font-serif text-lg font-semibold">
          <span className="sr-only">Stop {number}: </span>
          {stop.title}
        </p>
        {stop.venueName && stop.venueName !== stop.title && <p className="text-sm text-muted">{stop.venueName}</p>}
        {stop.address && <p className="text-sm text-muted">{stop.address}</p>}
        {stop.note && <p className="mt-1 text-sm">{stop.note}</p>}
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {stop.url && (
            <a href={stop.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              Website
            </a>
          )}
          <a href={mapsUrl(stop)} target="_blank" rel="noopener noreferrer" className={LINK}>
            Open in Google Maps
          </a>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="font-medium text-muted underline-offset-2 hover:underline disabled:opacity-60"
          >
            Remove stop
          </button>
        </p>
        {!hasCoords(stop) && <p className="mt-1 text-xs text-muted">Not shown on the map: no exact location.</p>}
      </div>
    </li>
  );
}
