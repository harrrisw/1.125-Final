"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { Profile } from "@/lib/profiles";

const MAX_ITEMS = 12;

function ListField({
  id,
  label,
  hint,
  items,
  setItems,
  suggestions,
  placeholder,
}: {
  id: string;
  label: string;
  hint: string;
  items: string[];
  setItems: (items: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const has = (item: string) => items.some((i) => i.toLowerCase() === item.trim().toLowerCase());

  function add(item: string) {
    const clean = item.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!clean || has(clean) || items.length >= MAX_ITEMS) return;
    setItems([...items, clean]);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
      setDraft("");
    }
  }

  const open = suggestions.filter((s) => !has(s));

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="font-normal text-muted">({items.length}/{MAX_ITEMS})</span>
      </label>
      <p className="-mt-1 text-xs text-muted">{hint}</p>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-1 rounded-full border border-line bg-paper py-1 pl-3 pr-1 text-sm">
              {item}
              <button
                type="button"
                onClick={() => setItems(items.filter((i) => i !== item))}
                aria-label={`Remove ${item}`}
                className="rounded-full px-2 text-muted hover:bg-sand"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={40}
          disabled={items.length >= MAX_ITEMS}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2"
        />
        <button
          type="button"
          onClick={() => {
            add(draft);
            setDraft("");
          }}
          disabled={!draft.trim() || items.length >= MAX_ITEMS}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-sand disabled:opacity-60"
        >
          Add
        </button>
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">From what Offhours remembers:</span>
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-line px-3 py-1 hover:bg-sand"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Edit what other members see. Suggestions from private memory are offered,
 * never copied: nothing becomes public until the person adds it and saves.
 */
export function ProfileEditor({
  profile,
  suggestedHobbies,
  suggestedPreferences,
  currentMood,
}: {
  profile: Profile;
  suggestedHobbies: string[];
  suggestedPreferences: string[];
  /** From the private mood the companion noted, offered as a one-tap fill. */
  currentMood: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [area, setArea] = useState(profile.homeArea ?? "");
  const [hobbies, setHobbies] = useState(profile.hobbies);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [mood, setMood] = useState(profile.mood ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name, bio, home_area: area, hobbies, preferences, mood }),
      });
      const result = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (result?.ok) {
        setStatus({ ok: true, text: "Saved. This is what other members see." });
        router.refresh();
      } else setStatus({ ok: false, text: result?.reason ?? "That did not save. Try again." });
    } catch {
      setStatus({ ok: false, text: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-xl border border-line bg-paper px-3 py-2 font-normal";

  return (
    <form onSubmit={save} className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name people see
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Area (optional)
          <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={60} placeholder="Cambridge" className={input} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Short bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Second-year at MIT. Happiest at a small gig or on a long walk."
          className={input}
        />
        <span className="self-end text-xs font-normal text-muted">{bio.length}/280</span>
      </label>

      <div className="flex flex-col gap-2">
        <label htmlFor="profile-mood" className="text-sm font-medium">
          Current mood <span className="font-normal text-muted">(shown for 12 hours, then it fades)</span>
        </label>
        <div className="flex gap-2">
          <input
            id="profile-mood"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            maxLength={80}
            placeholder="Restless, up for something low-key"
            className={`min-w-0 flex-1 ${input}`}
          />
          {mood && (
            <button type="button" onClick={() => setMood("")} className="rounded-full px-3 text-sm text-muted hover:bg-sand">
              Clear
            </button>
          )}
        </div>
        {currentMood && mood !== currentMood && (
          <button
            type="button"
            onClick={() => setMood(currentMood)}
            className="self-start rounded-full border border-dashed border-line px-3 py-1 text-sm hover:bg-sand"
          >
            Use the mood from your chat: {currentMood}
          </button>
        )}
      </div>

      <ListField
        id="profile-hobbies"
        label="Hobbies"
        hint="Things you do or love. Press Enter after each."
        items={hobbies}
        setItems={setHobbies}
        suggestions={suggestedHobbies}
        placeholder="Indie film"
      />
      <ListField
        id="profile-preferences"
        label="Likes to"
        hint="How you like to spend free time: quiet places, small groups, last-minute plans…"
        items={preferences}
        setItems={setPreferences}
        suggestions={suggestedPreferences}
        placeholder="Small groups"
      />

      <p className="text-sm text-muted">
        Everything here is visible to signed-in members and is checked before it is shown. Leave out
        phone numbers and email addresses; people can message you in Offhours.
      </p>

      {status && (
        <p role={status.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${status.ok ? "bg-sand" : "bg-sand text-accent"}`}>
          {status.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="self-start rounded-full bg-ink px-6 py-2.5 font-medium text-paper hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Checking and saving…" : "Save profile"}
      </button>
    </form>
  );
}
