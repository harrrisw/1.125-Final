"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Message, block and report, for someone else's profile or a conversation with them. */
export function PersonActions({
  userId,
  name,
  blockedByMe,
  showMessage = true,
  dmMessageId,
}: {
  userId: string;
  name: string;
  blockedByMe: boolean;
  showMessage?: boolean;
  /** When reporting from a conversation: the latest message from them. */
  dmMessageId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function setBlocked(blocked: boolean) {
    setBusy(true);
    const res = await fetch(`/api/people/${userId}/block`, { method: blocked ? "POST" : "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirmBlock(false);
    if (res?.ok) {
      setNote(blocked ? `You blocked ${name}.` : `You unblocked ${name}.`);
      router.refresh();
    } else setNote("That did not go through. Try again.");
  }

  async function sendReport(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/people/${userId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, ...(dmMessageId ? { dm_message_id: dmMessageId } : {}) }),
    }).catch(() => null);
    const result = (await res?.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
    setBusy(false);
    if (result?.ok) {
      setReporting(false);
      setReason("");
      setNote("Thanks. The report went to the people running the pilot. You can also block them.");
    } else setNote(result?.reason ?? "That did not go through. Try again.");
  }

  const button = "rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-sand disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showMessage && !blockedByMe && (
          <Link href={`/messages/new?to=${userId}`} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            Message
          </Link>
        )}
        {blockedByMe ? (
          <button type="button" disabled={busy} onClick={() => setBlocked(false)} className={button}>
            Unblock
          </button>
        ) : confirmBlock ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            Block {name}? You will not see each other&rsquo;s posts or messages.
            <button type="button" disabled={busy} onClick={() => setBlocked(true)} className={`${button} border-accent text-accent`}>
              Yes, block
            </button>
            <button type="button" onClick={() => setConfirmBlock(false)} className="text-muted hover:underline">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmBlock(true)} className={button}>
            Block
          </button>
        )}
        {!reporting && (
          <button type="button" onClick={() => setReporting(true)} className="text-sm text-muted hover:underline">
            Report
          </button>
        )}
      </div>

      {reporting && (
        <form onSubmit={sendReport} className="flex flex-col gap-2 rounded-2xl bg-sand p-4">
          <label htmlFor={`report-${userId}`} className="text-sm font-medium">
            What happened? Only the people running the pilot will see this.
          </label>
          <textarea
            id={`report-${userId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            className="rounded-xl border border-line bg-paper px-3 py-2"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !reason.trim()} className={button}>
              Send report
            </button>
            <button type="button" onClick={() => setReporting(false)} className="text-sm text-muted hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
