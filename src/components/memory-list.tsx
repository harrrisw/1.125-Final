"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatWhen } from "@/lib/format";
import type { CurrentState, MemoryItem, MemoryKind } from "@/lib/types";

const KIND_LABEL: Record<MemoryKind, string> = {
  interest: "Interests",
  like: "Likes",
  dislike: "Avoids",
  constraint: "Constraints",
  outing: "Past outings",
};
const KIND_ORDER: MemoryKind[] = ["interest", "like", "dislike", "constraint", "outing"];

export function MemoryList({ state, items }: { state: CurrentState | null; items: MemoryItem[] }) {
  return (
    <div className="flex flex-col gap-6">
      <StateCard state={state} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">Long-term profile</h2>
          <p className="text-sm text-muted">Kept for months and used to choose what to suggest.</p>
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-5 text-muted">
            Nothing saved yet. As you chat, lasting preferences show up here.
          </p>
        ) : (
          KIND_ORDER.filter((kind) => items.some((i) => i.kind === kind)).map((kind) => (
            <div key={kind}>
              <h3 className="mb-1 text-sm font-medium text-muted">{KIND_LABEL[kind]}</h3>
              <ul className="flex flex-col gap-2">
                {items
                  .filter((i) => i.kind === kind)
                  .map((item) => (
                    <MemoryRow key={item.id} item={item} />
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function StateCard({ state }: { state: CurrentState | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    await fetch("/api/memory/state", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  const bits = state
    ? [
        state.mood.length > 0 ? state.mood.join(", ") : null,
        state.energy !== null ? `energy ${state.energy}/5` : null,
        state.social !== null ? `wants ${state.social.replace("_", " ")}` : null,
        state.timeBudgetMinutes !== null ? `${state.timeBudgetMinutes} minutes free` : null,
      ].filter(Boolean)
    : [];

  return (
    <section className="rounded-2xl bg-sand p-5">
      <h2 className="font-serif text-xl font-semibold">Right now</h2>
      {state && bits.length > 0 ? (
        <div className="mt-1 flex items-center justify-between gap-4">
          <p>
            {bits.join(" · ")}
            <span className="block text-sm text-muted">Fades {formatWhen(state.expiresAt)}.</span>
          </p>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-full border border-ink px-4 py-2 text-sm font-medium hover:bg-card disabled:opacity-60"
          >
            Forget now
          </button>
        </div>
      ) : (
        <p className="mt-1 text-muted">
          No live mood. What you say about how you feel is kept for a few hours, then dropped.
        </p>
      )}
    </section>
  );
}

function MemoryRow({ item }: { item: MemoryItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(init: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/memory/${item.id}`, init).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("That did not save. Try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const save = () =>
    call({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
  const remove = () => call({ method: "DELETE" });

  return (
    <li className="rounded-2xl border border-line bg-card p-3">
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`memory-${item.id}`} className="sr-only">
            Edit memory
          </label>
          <input
            id={`memory-${item.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || draft.trim() === ""}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(item.content);
                setEditing(false);
              }}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-sand"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p>
            {item.content}
            {item.editedByUser && <span className="ml-2 text-xs text-muted">edited by you</span>}
          </p>
          <div className="flex gap-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full px-3 py-1 hover:bg-sand"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-full px-3 py-1 text-accent hover:bg-sand disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-accent">
          {error}
        </p>
      )}
    </li>
  );
}
