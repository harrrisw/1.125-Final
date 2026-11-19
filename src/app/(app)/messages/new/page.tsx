import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DmView } from "@/components/dm-view";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { SocialNotSetUp } from "@/components/social-not-set-up";
import { getPageSession } from "@/lib/auth";
import { findConversationWith } from "@/lib/messages";
import { getProfile, isBlockedBetween, SocialNotSetUpError } from "@/lib/profiles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewMessagePage({ searchParams }: PageProps<"/messages/new">) {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <NewMessage searchParams={searchParams} />
    </Suspense>
  );
}

const unavailable = (
  <div className="rounded-2xl border border-line bg-card p-6">
    <p>You cannot message this member.</p>
    <Link href="/messages" className="font-medium text-accent underline-offset-2 hover:underline">
      Back to messages
    </Link>
  </div>
);

/** Opens the conversation with a member, or an empty one that the first message will start. */
async function NewMessage({ searchParams }: Pick<PageProps<"/messages/new">, "searchParams">) {
  const { to } = await searchParams;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");
  if (typeof to !== "string" || !UUID.test(to) || to === session.user.id) return unavailable;

  let existing: string | null;
  try {
    existing = await findConversationWith(session.db, session.user.id, to);
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return <SocialNotSetUp />;
    throw err;
  }
  if (existing) redirect(`/messages/${existing}`);

  const [profile, blocked] = await Promise.all([
    getProfile(session.db, to),
    isBlockedBetween(session.db, session.user.id, to),
  ]);
  if (!profile || blocked) return unavailable;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Link href={`/people/${to}`} className="text-sm font-medium text-accent underline-offset-2 hover:underline">
        ← {profile.displayName}&rsquo;s profile
      </Link>
      <div className="rounded-2xl border border-line bg-card p-4">
        <h1 className="font-serif text-2xl font-semibold">Message {profile.displayName}</h1>
        <p className="text-sm text-muted">Only the two of you can read this conversation.</p>
      </div>
      <DmView
        threadId={null}
        recipientId={to}
        recipientName={profile.displayName}
        currentUserId={session.user.id}
        messages={[]}
      />
    </div>
  );
}
