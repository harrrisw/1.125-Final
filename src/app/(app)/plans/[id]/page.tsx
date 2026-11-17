import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { JoinButton } from "@/components/join-button";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { ThreadView } from "@/components/thread-view";
import { getPageSession } from "@/lib/auth";
import { getPost, listThread } from "@/lib/board";
import { formatWhen } from "@/lib/format";

export default function PlanPage({ params }: PageProps<"/plans/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: Pick<PageProps<"/plans/[id]">, "params">) {
  const { id } = await params;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const post = await getPost(session.db, id).catch(() => null);
  if (!post) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <p>This post is no longer open.</p>
        <Link href="/board" className="font-medium text-accent underline-offset-2 hover:underline">
          Back to the board
        </Link>
      </div>
    );
  }

  const when = formatWhen(post.startsAt);
  const meta = [post.authorName, post.area, when, `${post.goingCount} in`].filter(Boolean).join(" · ");
  const messages = post.joined ? await listThread(session.db, post.id) : [];

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-accent">
          {post.type === "mood" ? "Mood" : "Plan"}
        </p>
        <h1 className="font-serif text-2xl font-semibold">{post.body}</h1>
        <p className="text-sm text-muted">{meta}</p>
      </div>

      {post.joined ? (
        <ThreadView postId={post.id} currentUserId={session.user.id} messages={messages} />
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-5">
          <p>Join to see the group chat. Joining shows your name to the group.</p>
          <JoinButton postId={post.id} label={post.type === "mood" ? "Join chat" : "Join event"} />
        </div>
      )}
    </div>
  );
}
