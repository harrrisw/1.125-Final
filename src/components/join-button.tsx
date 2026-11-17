"use client";

import Link from "next/link";
import { useState } from "react";

type JoinState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "joined" }
  | { kind: "failed"; reason: string };

/**
 * A person tapping this is the explicit opt-in to join, so it goes straight
 * through the confirm gate in one request.
 */
export function JoinButton({
  postId,
  alreadyJoined = false,
  label = "Join",
}: {
  postId: string;
  alreadyJoined?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<JoinState>(alreadyJoined ? { kind: "joined" } : { kind: "idle" });

  async function join() {
    setState({ kind: "working" });
    try {
      const res = await fetch(`/api/posts/${postId}/join`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (body?.ok) setState({ kind: "joined" });
      else setState({ kind: "failed", reason: body?.reason ?? "That did not go through. Try again." });
    } catch {
      setState({ kind: "failed", reason: "Could not reach the server. Try again." });
    }
  }

  if (state.kind === "joined") {
    return (
      <Link
        href={`/plans/${postId}`}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Joined · open chat
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={join}
        disabled={state.kind === "working"}
        className="rounded-full border border-ink px-4 py-2 text-sm font-medium hover:bg-sand disabled:opacity-60"
      >
        {state.kind === "working" ? "Joining…" : label}
      </button>
      {state.kind === "failed" && (
        <p role="alert" className="max-w-56 text-right text-xs text-accent">
          {state.reason}
        </p>
      )}
    </div>
  );
}
