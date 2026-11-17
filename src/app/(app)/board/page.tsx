import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { JoinButton } from "@/components/join-button";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { listBoard, type BoardPost } from "@/lib/board";
import { formatWhen } from "@/lib/format";

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Public board</h1>
        <p className="text-muted">
          Moods and open plans people near you chose to share. To add yours, ask the companion in
          Chat: nothing is posted until you confirm it.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Loading the board…" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const posts = await listBoard(session.db);
  if (posts.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-card p-6 text-muted">
        Nothing is posted right now. Tell the companion what you are up for and it can draft a mood
        or a plan for you to share.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {posts.map((post) => (
        <Post key={post.id} post={post} isMine={post.authorId === session.user.id} />
      ))}
    </ul>
  );
}

function Post({ post, isMine }: { post: BoardPost; isMine: boolean }) {
  const when = formatWhen(post.startsAt);
  const count =
    post.type === "plan"
      ? post.capacity
        ? `${post.goingCount} of ${post.capacity} spots taken`
        : `${post.goingCount} going`
      : `${post.goingCount} in the conversation`;
  const meta = [post.authorName, post.area, when, count].filter(Boolean).join(" · ");

  return (
    <li className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 rounded-md px-2 py-1 text-xs font-semibold ${
            post.type === "mood" ? "bg-accent text-paper" : "bg-ink text-paper"
          }`}
        >
          {post.type === "mood" ? "Mood" : "Plan"}
        </span>
        <div>
          <p>{post.body}</p>
          <p className="text-sm text-muted">{meta}</p>
        </div>
      </div>
      {isMine ? (
        <Link
          href={`/plans/${post.id}`}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-sand"
        >
          Yours · open
        </Link>
      ) : (
        <JoinButton
          postId={post.id}
          alreadyJoined={post.joined}
          label={post.type === "mood" ? "Join chat" : "Join event"}
        />
      )}
    </li>
  );
}
