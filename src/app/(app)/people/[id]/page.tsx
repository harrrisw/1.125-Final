import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PersonActions } from "@/components/person-actions";
import { ProfileCard } from "@/components/profile-card";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { SocialNotSetUp } from "@/components/social-not-set-up";
import { getPageSession } from "@/lib/auth";
import { listBoard } from "@/lib/board";
import { getProfile, haveBlocked, isBlockedBetween, SocialNotSetUpError, type Profile } from "@/lib/profiles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading the profile…" />}>
      <Person params={params} />
    </Suspense>
  );
}

const unavailable = (
  <div className="rounded-2xl border border-line bg-card p-6">
    <p>This profile is not available.</p>
    <Link href="/board" className="font-medium text-accent underline-offset-2 hover:underline">
      Back to the board
    </Link>
  </div>
);

async function Person({ params }: Pick<PageProps<"/people/[id]">, "params">) {
  const { id } = await params;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");
  if (!UUID.test(id)) return unavailable;

  const isMe = id === session.user.id;
  let profile: Profile | null;
  try {
    profile = await getProfile(session.db, id);
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return <SocialNotSetUp />;
    throw err;
  }
  if (!profile) return unavailable;

  if (!isMe && (await isBlockedBetween(session.db, session.user.id, id))) {
    // Someone who blocked you looks like a missing profile; someone you blocked can be unblocked.
    if (!(await haveBlocked(session.db, session.user.id, id))) return unavailable;
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-6">
        <p>
          You blocked <span className="font-medium">{profile.displayName}</span>. Neither of you sees the other&rsquo;s
          posts or messages.
        </p>
        <PersonActions userId={id} name={profile.displayName} blockedByMe showMessage={false} />
      </div>
    );
  }

  const posts = (await listBoard(session.db, 100)).filter((p) => p.authorId === id);

  return (
    <div className="flex flex-col gap-4">
      {isMe ? (
        <p className="rounded-2xl bg-sand px-4 py-3 text-sm">
          This is how others see your profile.{" "}
          <Link href="/profile" className="font-medium text-accent underline-offset-2 hover:underline">
            Edit it
          </Link>
        </p>
      ) : null}
      <ProfileCard profile={profile} posts={posts} isMe={isMe} />
      {!isMe && <PersonActions userId={id} name={profile.displayName} blockedByMe={false} />}
    </div>
  );
}
