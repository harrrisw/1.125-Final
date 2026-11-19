import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/chat-view";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { loadActionStates, loadMessages } from "@/lib/chat/store";
import { goneSavedPlans, PlansNotSetUpError } from "@/lib/itineraries";

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
  const planIds = messages.flatMap((m) =>
    m.cards.flatMap((c) => (c.type === "plan_saved" ? [c.planId] : [])),
  );
  const [actions, gonePlans] = await Promise.all([
    loadActionStates(session.db, actionIds),
    // If saved plans are not set up, there is nothing to mark as gone.
    goneSavedPlans(session.db, session.user.id, planIds).catch((err) => {
      if (err instanceof PlansNotSetUpError) return [];
      throw err;
    }),
  ]);

  return <ChatView initialMessages={messages} initialActions={actions} gonePlans={gonePlans} />;
}
