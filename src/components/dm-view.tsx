"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatWhen } from "@/lib/format";
import type { DirectMessage } from "@/lib/messages";

/** One conversation. `threadId` is null until the first message starts it. */
export function DmView({
  threadId,
  recipientId,
  recipientName,
  currentUserId,
  messages,
}: {
  threadId: string | null;
  recipientId: string;
  recipientName: string;
  currentUserId: string;
  messages: DirectMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const latest = messages.at(-1)?.id;

  // Seeing the conversation marks it read, including new messages that arrive while it is open.
  useEffect(() => {
    if (threadId) void fetch(`/api/messages/${threadId}/read`, { method: "POST" }).catch(() => null);
  }, [threadId, latest]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [latest]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipientId, body }),
      });
      const result = (await res.json().catch(() => null)) as { ok?: boolean; threadId?: string; reason?: string } | null;
      if (result?.ok && result.threadId) {
        setInput("");
        if (!threadId) router.replace(`/messages/${result.threadId}`);
        else router.refresh();
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
          <li className="text-muted">
            Say hello to {recipientName}. Keep it friendly, and meet at public places.
          </li>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? "bg-ink text-paper" : "border border-line bg-card"}`}>
                <p className={`text-xs ${mine ? "opacity-70" : "text-muted"}`}>
                  {mine ? "You" : recipientName} · {formatWhen(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />

      {error && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="dm-message" className="sr-only">
          Message {recipientName}
        </label>
        <input
          id="dm-message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder={`Message ${recipientName}`}
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-5 py-3"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ""}
          className="rounded-full bg-ink px-6 py-3 font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
