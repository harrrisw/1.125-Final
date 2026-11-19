"use client";

import Link from "next/link";
import { useState } from "react";
import { JoinButton } from "@/components/join-button";
import { PlacesMap, type MapPlace } from "@/components/places-map";
import type { ActionState } from "@/lib/chat/store";
import { formatWhen } from "@/lib/format";
import { hasCoords, mapsUrl } from "@/lib/links";
import type { Card } from "@/lib/types";

type NotedCard = Extract<Card, { type: "noted" }>;
type PickCard = Extract<Card, { type: "pick" }>;
type ConfirmCard = Extract<Card, { type: "confirm" }>;
type PlanSavedCard = Extract<Card, { type: "plan_saved" }>;

export function CardList({
  cards,
  actions,
  gonePlans = [],
}: {
  cards: Card[];
  actions: Record<string, ActionState>;
  gonePlans?: string[];
}) {
  const [mapOpen, setMapOpen] = useState(false);
  if (cards.length === 0) return null;
  const noted = cards.filter((c): c is NotedCard => c.type === "noted");
  // A place is shown once even if a message stored it twice (messages saved
  // before searches in one turn were de-duplicated can hold repeats).
  const seenPicks = new Set<string>();
  const rest = cards.filter((c) => {
    if (c.type === "noted") return false;
    if (c.type !== "pick") return true;
    if (seenPicks.has(c.candidateId)) return false;
    seenPicks.add(c.candidateId);
    return true;
  });

  // Picks are numbered in the order shown, and the map's pins carry the same numbers.
  const picks = rest.filter((c): c is PickCard => c.type === "pick");
  const numberOf = new Map(picks.map((p, i) => [p, i + 1]));
  const onMap: MapPlace[] = picks.filter(hasCoords).map((p) => ({
    id: p.candidateId,
    label: String(numberOf.get(p)),
    title: p.title,
    subtitle: p.area,
    lat: p.lat,
    lng: p.lng,
    href: mapsUrl(p),
  }));

  return (
    <div className="mt-2 flex flex-col gap-2">
      {noted.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {noted.map((card) => (
            <Noted key={card.memoryId} card={card} />
          ))}
        </div>
      )}
      {rest.map((card) =>
        card.type === "pick" ? (
          <Pick key={`pick-${card.candidateId}`} card={card} number={numberOf.get(card) ?? 0} />
        ) : card.type === "confirm" ? (
          <Confirm key={card.actionId} card={card} initial={actions[card.actionId]} />
        ) : card.type === "plan_saved" ? (
          <PlanSaved key={`plan-${card.planId}`} card={card} gone={gonePlans.includes(card.planId)} />
        ) : null,
      )}
      {onMap.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMapOpen((open) => !open)}
            aria-expanded={mapOpen}
            className="self-start rounded-full border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-sand"
          >
            {mapOpen ? "Hide map" : onMap.length === 1 ? "Show on a map" : `Show all ${onMap.length} on a map`}
          </button>
          {mapOpen && <PlacesMap places={onMap} label="Map of the suggested places" />}
        </div>
      )}
    </div>
  );
}

/** "The agent says what it learned so you can fix it." */
function Noted({ card }: { card: NotedCard }) {
  const [state, setState] = useState<"kept" | "working" | "removed">("kept");

  async function undo() {
    setState("working");
    const res = await fetch(`/api/memory/${card.memoryId}`, { method: "DELETE" }).catch(() => null);
    setState(res?.ok ? "removed" : "kept");
  }

  if (state === "removed") {
    return <span className="rounded-full bg-sand px-3 py-1 text-xs text-muted">Forgotten</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-sand px-3 py-1 text-xs">
      <span>
        <span className="text-muted">Noted · {card.kind}:</span> {card.content}
      </span>
      <button
        type="button"
        onClick={undo}
        disabled={state === "working"}
        className="font-medium text-accent underline-offset-2 hover:underline disabled:opacity-60"
      >
        Undo
      </button>
    </span>
  );
}

const LINK = "font-medium text-accent underline-offset-2 hover:underline";

/**
 * One idea. Every pick links somewhere: the venue's website when the catalog
 * has one, always a map, and for an open plan its page on the board.
 */
function Pick({ card, number }: { card: PickCard; number: number }) {
  const when = formatWhen(card.startsAt);
  const meta = [card.kind === "open_plan" ? "Open plan" : null, when, card.area]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex min-w-0 gap-3">
        <span aria-hidden="true" className="offhours-pin mt-1 shrink-0">
          {number}
        </span>
        <div className="min-w-0">
          {meta && <p className="text-xs font-medium tracking-wide text-accent">{meta}</p>}
          <p className="font-serif text-lg font-semibold">{card.title}</p>
          <p className="text-sm text-muted">{card.reason}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {card.url && (
              <a href={card.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                Website
              </a>
            )}
            <a href={mapsUrl(card)} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open in Google Maps
            </a>
            {card.kind === "open_plan" && (
              <Link href={`/plans/${card.candidateId}`} className={LINK}>
                See the plan
              </Link>
            )}
          </p>
        </div>
      </div>
      {card.kind === "open_plan" && <JoinButton postId={card.candidateId} />}
    </div>
  );
}

/** Shown when the companion saved an outing to the Plans tab. Private, and undoable. */
function PlanSaved({ card, gone = false }: { card: PlanSavedCard; gone?: boolean }) {
  const [state, setState] = useState<"saved" | "working" | "removed" | "failed">(gone ? "removed" : "saved");

  async function undo() {
    setState("working");
    const res = await fetch(`/api/itineraries/${card.planId}`, { method: "DELETE" }).catch(() => null);
    // 404: it was already removed (from the Plans tab, say), which is what Undo wants.
    setState(res && (res.ok || res.status === 404) ? "removed" : "failed");
  }

  if (state === "removed") {
    return (
      <p className="rounded-2xl bg-sand px-4 py-3 text-sm text-muted">
        &ldquo;{card.title}&rdquo; is no longer in your plans.
      </p>
    );
  }
  const stops = card.stopCount === 1 ? "1 stop" : `${card.stopCount} stops`;
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-accent">Saved to your plans · only you can see it</p>
      <p className="font-serif text-lg font-semibold">{card.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">{stops}</span>
        <Link href={`/planner/${card.planId}`} className={LINK}>
          Open the plan and map
        </Link>
        <button type="button" onClick={undo} disabled={state === "working"} className={`${LINK} disabled:opacity-60`}>
          Undo
        </button>
      </p>
      {state === "failed" && (
        <p role="alert" className="mt-1 text-sm text-accent">
          That did not go through. Try again, or delete it from the Plans tab.
        </p>
      )}
    </div>
  );
}

type ConfirmState =
  | { kind: "waiting" }
  | { kind: "working" }
  | { kind: "done"; postId?: string; calendarUrl?: string }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: string };

function fromServer(initial: ActionState | undefined): ConfirmState {
  switch (initial?.status) {
    case "executed":
      return {
        kind: "done",
        postId: initial.result?.post_id,
        calendarUrl: initial.result?.calendar_url,
      };
    case "cancelled":
      return { kind: "cancelled" };
    case "failed":
      return { kind: "failed", reason: initial.result?.reason ?? "This did not go through." };
    case "expired":
      return { kind: "failed", reason: "This draft expired before it was confirmed." };
    case "confirmed":
      return { kind: "working" };
    default:
      return { kind: "waiting" };
  }
}

/**
 * The confirm gate, as the user sees it. Nothing here happens until they tap
 * Confirm, and the text shown is exactly what would go public.
 */
function Confirm({ card, initial }: { card: ConfirmCard; initial: ActionState | undefined }) {
  const [state, setState] = useState<ConfirmState>(() => fromServer(initial));

  async function confirm() {
    setState({ kind: "working" });
    try {
      const res = await fetch(`/api/actions/${card.actionId}/confirm`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; postId?: string; calendarUrl?: string }
        | { ok: false; reason: string }
        | null;
      if (body?.ok) setState({ kind: "done", postId: body.postId, calendarUrl: body.calendarUrl });
      else setState({ kind: "failed", reason: body?.reason ?? "That did not go through. Try again." });
    } catch {
      setState({ kind: "failed", reason: "Could not reach the server. Nothing was posted." });
    }
  }

  async function cancel() {
    setState({ kind: "working" });
    await fetch(`/api/actions/${card.actionId}/cancel`, { method: "POST" }).catch(() => null);
    setState({ kind: "cancelled" });
  }

  return (
    <div className="rounded-2xl border-2 border-accent bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-accent">Needs your OK</p>
      <p className="font-medium">{card.summary}</p>
      {card.publicText && (
        <blockquote className="mt-2 rounded-xl bg-sand px-3 py-2 text-sm">{card.publicText}</blockquote>
      )}

      <div className="mt-3 text-sm">
        {state.kind === "waiting" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-full bg-accent px-4 py-2 font-medium text-paper hover:opacity-90"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-full border border-line px-4 py-2 font-medium hover:bg-sand"
            >
              Cancel
            </button>
          </div>
        )}
        {state.kind === "working" && <p role="status">Working…</p>}
        {state.kind === "cancelled" && <p className="text-muted">Cancelled. Nothing was shared.</p>}
        {state.kind === "failed" && (
          <p role="alert" className="text-accent">
            {state.reason}
          </p>
        )}
        {state.kind === "done" && <Done card={card} state={state} />}
      </div>
    </div>
  );
}

function Done({
  card,
  state,
}: {
  card: ConfirmCard;
  state: Extract<ConfirmState, { kind: "done" }>;
}) {
  if (card.actionType === "calendar_add") {
    return state.calendarUrl ? (
      <a
        href={state.calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-accent underline-offset-2 hover:underline"
      >
        Open in Google Calendar to save it
      </a>
    ) : (
      <p>Ready for your calendar.</p>
    );
  }
  const label = card.actionType === "join_post" ? "You're in." : "Posted to the board.";
  return (
    <p>
      {label}{" "}
      <Link
        href={state.postId ? `/plans/${state.postId}` : "/board"}
        className="font-medium text-accent underline-offset-2 hover:underline"
      >
        Open it
      </Link>
    </p>
  );
}
