"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { communityTime } from "@/lib/when";

type Kind = "post_mood" | "post_plan";

export interface ComposerActivity {
  id: string;
  title: string;
  area: string | null;
}

/**
 * Post a mood or a plan straight to the board. What is typed here is exactly
 * what others see; tapping Post is the confirmation, and the server still runs
 * it through the confirm gate and moderation.
 */
export function PostComposer({
  activity,
  startOpen = false,
}: {
  activity?: ComposerActivity | null;
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen || Boolean(activity));
  const [kind, setKind] = useState<Kind>(activity ? "post_plan" : "post_mood");
  const [body, setBody] = useState(activity ? `${activity.title}: anyone want to come along?` : "");
  const [area, setArea] = useState(activity?.area ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [hours, setHours] = useState("6");
  const [linked, setLinked] = useState<ComposerActivity | null>(activity ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full bg-ink px-5 py-2.5 font-medium text-paper hover:opacity-90"
      >
        Post to the board
      </button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const payload: Record<string, unknown> = { body: body.trim() };
    if (area.trim()) payload.area = area.trim();
    if (kind === "post_plan") {
      const start = communityTime(startsAt);
      if (!start) return setError("Pick when the plan starts.");
      payload.starts_at = start.toISOString();
      if (capacity) payload.capacity = Number(capacity);
      if (linked) payload.activity_id = linked.id;
    } else {
      payload.expires_in_hours = Number(hours);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, payload }),
      });
      const result = (await res.json().catch(() => null)) as { ok?: boolean; postId?: string; reason?: string } | null;
      if (result?.ok && result.postId) {
        // Straight into the new post's group chat.
        router.push(`/plans/${result.postId}`);
      } else {
        setError(result?.reason ?? "That did not post. Try again.");
        setBusy(false);
      }
    } catch {
      setError("Could not reach the server. Try again.");
      setBusy(false);
    }
  }

  const tab = (value: Kind, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === value}
      onClick={() => setKind(value)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === value ? "bg-ink text-paper" : "hover:bg-sand"}`}
    >
      {label}
    </button>
  );

  return (
    <form id="compose" onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="What to post" className="flex gap-1">
          {tab("post_mood", "Share a mood")}
          {tab("post_plan", "Post a plan")}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">
          Close
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {kind === "post_mood" ? "How are you feeling, and what are you up for?" : "What's the plan?"}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          required
          placeholder={
            kind === "post_mood"
              ? "Restless after midterms, up for a walk or something low-key tonight."
              : "Pub trivia at Central Square, need two more for a team."
          }
          className="rounded-xl border border-line bg-paper px-3 py-2 font-normal"
        />
        <span className="self-end text-xs font-normal text-muted">{body.length}/500</span>
      </label>

      {linked && kind === "post_plan" && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">At</span>
          <span className="font-medium">{linked.title}</span>
          <button type="button" onClick={() => setLinked(null)} className="text-accent hover:underline">
            Remove
          </button>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Area (optional)
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={80}
            placeholder="Harvard Square"
            className="rounded-xl border border-line bg-paper px-3 py-2 font-normal"
          />
        </label>
        {kind === "post_plan" ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Starts (Boston time)
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="rounded-xl border border-line bg-paper px-3 py-2 font-normal"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Show it for
            <select
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="rounded-xl border border-line bg-paper px-3 py-2 font-normal"
            >
              <option value="3">3 hours</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">A day</option>
            </select>
          </label>
        )}
        {kind === "post_plan" && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Group size, you included (optional)
            <input
              type="number"
              min={2}
              max={50}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="No limit"
              className="rounded-xl border border-line bg-paper px-3 py-2 font-normal"
            />
          </label>
        )}
      </div>

      <p className="text-sm text-muted">
        This goes on the board under your name, exactly as written. Meet at public places only. A
        group chat opens for anyone who joins.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || body.trim() === ""}
        className="self-start rounded-full bg-ink px-6 py-2.5 font-medium text-paper hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Checking and posting…" : "Post"}
      </button>
    </form>
  );
}
