import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/chat-view";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { loadActionStates, loadMessages } from "@/lib/chat/store";

export default function ChatPage() {
  // The session is read at request time, so it streams in behind a boundary.
  return (
    <Suspense fallback={<PageLoading label="Loading your chat…" />}>
      <Chat />
    </Suspense>
  );
}

async function Chat() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const messages = await loadMessages(session.db, session.user.id, 40);
  const actionIds = messages.flatMap((m) =>
    m.cards.flatMap((c) => (c.type === "confirm" ? [c.actionId] : [])),
  );
  const actions = await loadActionStates(session.db, actionIds);

  return <ChatView initialMessages={messages} initialActions={actions} />;
}
