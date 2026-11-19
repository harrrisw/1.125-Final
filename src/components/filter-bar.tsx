"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { WHEN_OPTIONS } from "@/lib/when";

export interface FilterValues {
  mood?: string | null;
  q?: string | null;
  when?: string | null;
  date?: string | null;
  type?: string | null;
}

/**
 * Filters kept in the URL, so a filtered view can be reloaded or shared.
 * Changing a chip or the date applies at once; the keyword applies on Enter.
 */
export function FilterBar({
  basePath,
  values,
  moods,
  types,
  today,
}: {
  basePath: string;
  values: FilterValues;
  moods?: { id: string; label: string; hint: string }[];
  types?: { value: string; label: string }[];
  /** The community's local date, so the date picker cannot go into the past. */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(values.q ?? "");

  function go(next: FilterValues) {
    const merged = { ...values, q, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "any" && value !== "all") params.set(key, value);
    }
    if (merged.when !== "date") params.delete("date");
    const query = params.toString();
    startTransition(() => router.push(query ? `${basePath}?${query}` : basePath));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    go({ q: q.trim() });
  }

  const active = Boolean(values.mood || values.q || (values.when && values.when !== "any") || (values.type && values.type !== "all"));
  const chip = (selected: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium ${
      selected ? "border-ink bg-ink text-paper" : "border-line bg-card hover:bg-sand"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-busy={pending}>
      {moods && (
        <div role="group" aria-label="Mood" className="flex flex-wrap gap-2">
          {moods.map((m) => {
            const selected = values.mood === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                aria-pressed={selected}
                onClick={() => go({ mood: selected ? null : m.id })}
                className={chip(selected)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {types && (
        <div role="group" aria-label="Kind of post" className="flex flex-wrap gap-2">
          {types.map((t) => {
            const selected = (values.type ?? "all") === t.value;
            return (
              <button key={t.value} type="button" aria-pressed={selected} onClick={() => go({ type: t.value })} className={chip(selected)}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submit} className="flex min-w-0 flex-1 basis-56 gap-2">
          <label htmlFor={`${basePath}-q`} className="sr-only">
            Search by keyword
          </label>
          <input
            id={`${basePath}-q`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keyword: art, trivia, a walk…"
            maxLength={80}
            className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2"
          />
          <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            Search
          </button>
        </form>

        <label htmlFor={`${basePath}-when`} className="sr-only">
          When
        </label>
        <select
          id={`${basePath}-when`}
          value={values.when ?? "any"}
          onChange={(e) => go({ when: e.target.value, date: e.target.value === "date" ? values.date || today : null })}
          className="rounded-full border border-line bg-paper px-3 py-2 text-sm"
        >
          {WHEN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {values.when === "date" && (
          <>
            <label htmlFor={`${basePath}-date`} className="sr-only">
              Date
            </label>
            <input
              id={`${basePath}-date`}
              type="date"
              min={today}
              value={values.date ?? today}
              onChange={(e) => e.target.value && go({ when: "date", date: e.target.value })}
              className="rounded-full border border-line bg-paper px-3 py-2 text-sm"
            />
          </>
        )}
      </div>

      {(active || pending) && (
        <div className="flex items-center gap-3 text-sm">
          {pending && <span className="text-muted">Updating…</span>}
          {active && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                startTransition(() => router.push(basePath));
              }}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
