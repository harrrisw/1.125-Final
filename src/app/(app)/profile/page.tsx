import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileEditor } from "@/components/profile-editor";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { SocialNotSetUp } from "@/components/social-not-set-up";
import { getPageSession } from "@/lib/auth";
import { listMemory } from "@/lib/memory/profile";
import { loadState } from "@/lib/memory/state";
import { getProfile, SocialNotSetUpError, type Profile } from "@/lib/profiles";

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Your profile</h1>
        <p className="text-muted">What other members see when they open your name on the board or in a chat.</p>
      </div>
      <Suspense fallback={<PageLoading label="Loading your profile…" />}>
        <Editor />
      </Suspense>
    </div>
  );
}

async function Editor() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  let profile: Profile | null;
  try {
    profile = await getProfile(session.db, session.user.id);
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return <SocialNotSetUp />;
    throw err;
  }
  if (!profile) return <p className="text-muted">Your profile could not be found.</p>;

  const [memory, state] = await Promise.all([
    listMemory(session.db, session.user.id),
    loadState(session.db, session.user.id),
  ]);
  // Suggestions only: private memory is shown here to its owner, never copied out.
  const of = (kind: string) => memory.filter((m) => m.kind === kind).map((m) => m.content.slice(0, 40));

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/people/${session.user.id}`} className="self-start text-sm font-medium text-accent underline-offset-2 hover:underline">
        See your profile as others do →
      </Link>
      <ProfileEditor
        profile={profile}
        suggestedHobbies={of("interest")}
        suggestedPreferences={of("like")}
        currentMood={state && state.mood.length > 0 ? state.mood.join(", ") : null}
      />
      <section className="rounded-2xl bg-sand p-5">
        <h2 className="font-serif text-lg font-semibold">Private to you</h2>
        <p className="text-sm">
          What the companion remembers about you, and the mood it noted from your chat, stay private.{" "}
          <Link href="/memory" className="font-medium text-accent underline-offset-2 hover:underline">
            See and edit your memory
          </Link>
        </p>
      </section>
    </div>
  );
}
