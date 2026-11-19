import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DmView } from "@/components/dm-view";
import { PersonActions } from "@/components/person-actions";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { SocialNotSetUp } from "@/components/social-not-set-up";
import { getPageSession } from "@/lib/auth";
import { getConversation, type Conversation } from "@/lib/messages";
import { SocialNotSetUpError } from "@/lib/profiles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading the conversation…" />}>
      <Thread params={params} />
    </Suspense>
  );
}

async function Thread({ params }: Pick<PageProps<"/messages/[id]">, "params">) {
  const { id } = await params;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  let conversation: Conversation | null = null;
  try {
    conversation = UUID.test(id) ? await getConversation(session.db, session.user.id, id) : null;
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return <SocialNotSetUp />;
    throw err;
  }
  if (!conversation) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <p>This conversation is not available.</p>
        <p className="text-sm text-muted">
          If you blocked this person, you can unblock them from their profile.
        </p>
        <Link href="/messages" className="font-medium text-accent underline-offset-2 hover:underline">
          Back to messages
        </Link>
      </div>
    );
  }

  const lastFromThem = [...conversation.messages].reverse().find((m) => m.senderId !== session.user.id);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <AutoRefresh />
      <Link href="/messages" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
        ← Messages
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">
            <Link href={`/people/${conversation.otherId}`} className="hover:underline">
              {conversation.otherName}
            </Link>
          </h1>
          <p className="text-sm text-muted">Only the two of you can read this.</p>
        </div>
        <PersonActions
          userId={conversation.otherId}
          name={conversation.otherName}
          blockedByMe={false}
          showMessage={false}
          dmMessageId={lastFromThem?.id}
        />
      </div>
      <DmView
        threadId={conversation.id}
        recipientId={conversation.otherId}
        recipientName={conversation.otherName}
        currentUserId={session.user.id}
        messages={conversation.messages}
      />
    </div>
  );
}
