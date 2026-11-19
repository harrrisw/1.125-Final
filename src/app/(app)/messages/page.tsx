import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { SocialNotSetUp } from "@/components/social-not-set-up";
import { getPageSession } from "@/lib/auth";
import { formatWhen } from "@/lib/format";
import { listInbox, type InboxEntry } from "@/lib/messages";
import { SocialNotSetUpError } from "@/lib/profiles";

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Messages</h1>
        <p className="text-muted">
          One-to-one conversations. Only the two of you can read them. To start one, open someone&rsquo;s
          name on the board or in a group chat and tap Message.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Loading your messages…" />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  let inbox: InboxEntry[];
  try {
    inbox = await listInbox(session.db, session.user.id);
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return <SocialNotSetUp />;
    throw err;
  }

  if (inbox.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-card p-6 text-muted">
        No conversations yet. Find someone on the{" "}
        <Link href="/board" className="font-medium text-accent underline-offset-2 hover:underline">
          board
        </Link>
        , open their name, and send a message.
      </p>
    );
  }

  return (
    <>
      <AutoRefresh everyMs={10000} />
      <ul className="flex flex-col gap-2">
        {inbox.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/messages/${entry.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 hover:border-ink"
            >
              <span className="min-w-0">
                <span className={`block ${entry.unread ? "font-semibold" : "font-medium"}`}>{entry.otherName}</span>
                <span className="block truncate text-sm text-muted">
                  {entry.lastFromMe ? "You: " : ""}
                  {entry.lastBody ?? ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {formatWhen(entry.lastMessageAt)}
                {entry.unread && <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-label="Unread" role="img" />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
