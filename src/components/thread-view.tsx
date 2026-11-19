"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ThreadMessage } from "@/lib/board";
import { formatWhen } from "@/lib/format";

export function ThreadView({
  postId,
  currentUserId,
  messages,
}: {
  postId: string;
  currentUserId: string;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (result?.ok) {
        setInput("");
        router.refresh();
      } else {
        setError(result?.reason ?? "That did not send. Try again.");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ul className="flex flex-1 flex-col gap-2" aria-live="polite">
        {messages.length === 0 && (
          <li className="text-muted">No messages yet. Say hello and sort out where to meet.</li>
        )}
        {messages.map((m) => {
          const mine = m.userId === currentUserId;
          return (
            <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  mine ? "bg-ink text-paper" : "border border-line bg-card"
                }`}
              >
                <p className={`text-xs ${mine ? "opacity-70" : "text-muted"}`}>
                  {mine ? (
                    "You"
                  ) : (
                    <Link href={`/people/${m.userId}`} className="font-medium hover:underline">
                      {m.authorName}
                    </Link>
                  )}{" "}
                  · {formatWhen(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="thread-message" className="sr-only">
          Message the group
        </label>
        <input
          id="thread-message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="Message the group"
          className="flex-1 rounded-full border border-line bg-card px-5 py-3"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ""}
          className="rounded-full bg-ink px-6 py-3 font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
