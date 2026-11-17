"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CardList } from "@/components/cards";
import type { ActionState } from "@/lib/chat/store";
import type { ChatMessage, TurnEvent } from "@/lib/types";

export function ChatView({
  initialMessages,
  initialActions,
}: {
  initialMessages: ChatMessage[];
  initialActions: Record<string, ActionState>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setError(null);
    setBusy(true);

    const stamp = new Date().toISOString();
    const replyId = `reply-${stamp}`;
    setMessages((prev) => [
      ...prev,
      { id: `sent-${stamp}`, role: "user", content: text, cards: [], createdAt: stamp },
      { id: replyId, role: "assistant", content: "", cards: [], createdAt: stamp },
    ]);
    const patchReply = (patch: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? patch(m) : m)));

    const handle = (e: TurnEvent) => {
      if (e.type === "text") patchReply((m) => ({ ...m, content: m.content + e.delta }));
      else if (e.type === "cards") patchReply((m) => ({ ...m, cards: [...m.cards, ...e.cards] }));
      else if (e.type === "error") setError(e.message);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The message did not go through.");
      }

      // The endpoint streams one JSON event per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as TurnEvent);
          newline = buffer.indexOf("\n");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col gap-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-line bg-card p-6 text-muted">
            <p className="font-serif text-xl font-semibold text-ink">What are you up for?</p>
            <p className="mt-1">
              Tell me how you feel and how much time you have. For example: “Long week. I want to
              get out, nothing too loud, two or three hours.”
            </p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-ink px-4 py-3 text-paper">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={m.id} className="max-w-[90%]">
              {m.content ? (
                <p className="whitespace-pre-wrap rounded-2xl border border-line bg-card px-4 py-3">
                  {m.content}
                </p>
              ) : (
                busy && <p className="px-1 text-sm text-muted">Thinking…</p>
              )}
              <CardList cards={m.cards} actions={initialActions} />
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <form onSubmit={send} className="sticky bottom-4 flex gap-2">
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <input
          id="message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          autoComplete="off"
          placeholder="How are you feeling, and how long have you got?"
          className="flex-1 rounded-full border border-line bg-card px-5 py-3 shadow-sm"
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
