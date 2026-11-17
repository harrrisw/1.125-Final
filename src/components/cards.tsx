"use client";

import Link from "next/link";
import { useState } from "react";
import { JoinButton } from "@/components/join-button";
import type { ActionState } from "@/lib/chat/store";
import { formatWhen } from "@/lib/format";
import type { Card } from "@/lib/types";

type NotedCard = Extract<Card, { type: "noted" }>;
type PickCard = Extract<Card, { type: "pick" }>;
type ConfirmCard = Extract<Card, { type: "confirm" }>;

export function CardList({
  cards,
  actions,
}: {
  cards: Card[];
  actions: Record<string, ActionState>;
}) {
  if (cards.length === 0) return null;
  const noted = cards.filter((c): c is NotedCard => c.type === "noted");
  const rest = cards.filter((c) => c.type !== "noted");

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
          <Pick key={`pick-${card.candidateId}`} card={card} />
        ) : card.type === "confirm" ? (
          <Confirm key={card.actionId} card={card} initial={actions[card.actionId]} />
        ) : null,
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

function Pick({ card }: { card: PickCard }) {
  const when = formatWhen(card.startsAt);
  const meta = [card.kind === "open_plan" ? "Open plan" : null, when, card.area]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-card p-4">
      <div>
        {meta && <p className="text-xs font-medium tracking-wide text-accent">{meta}</p>}
        <p className="font-serif text-lg font-semibold">{card.title}</p>
        <p className="text-sm text-muted">{card.reason}</p>
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            Details
          </a>
        )}
      </div>
      {card.kind === "open_plan" && <JoinButton postId={card.candidateId} />}
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
