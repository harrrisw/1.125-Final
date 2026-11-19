import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { JoinButton } from "@/components/join-button";
import { PostComposer, type ComposerActivity } from "@/components/post-composer";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { listBoard, type BoardPost } from "@/lib/board";
import { filterBoard } from "@/lib/explore";
import { formatWhen } from "@/lib/format";
import { localToday, resolveWhen } from "@/lib/when";

const TYPES = [
  { value: "all", label: "Everything" },
  { value: "plan", label: "Plans" },
  { value: "mood", label: "Moods" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Public board</h1>
        <p className="text-muted">
          Moods and open plans people near you chose to share. Open one to see who is in and chat
          with the group.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Loading the board…" />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

async function Board({ searchParams }: Pick<PageProps<"/board">, "searchParams">) {
  const params = await searchParams;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const now = new Date();
  const values = {
    type: one(params.type) ?? "all",
    q: one(params.q),
    when: one(params.when) ?? "any",
    date: one(params.date),
  };
  const type = values.type === "plan" || values.type === "mood" ? values.type : "all";
  const window = resolveWhen(values.when, values.date, now);

  // "Post a plan here" from Explore arrives with the place already chosen.
  const activityId = one(params.activity);
  let activity: ComposerActivity | null = null;
  if (activityId && UUID.test(activityId)) {
    const { data } = await session.db.from("activities").select("id, title, area").eq("id", activityId).maybeSingle();
    activity = data ? { id: data.id as string, title: data.title as string, area: (data.area as string | null) ?? null } : null;
  }

  const all = await listBoard(session.db, 100);
  const { posts, keywordMatched } = filterBoard(all, { type, q: values.q, window }, now);
  const filtered = posts.length !== all.length;

  return (
    <div className="flex flex-col gap-4">
      <PostComposer activity={activity} />
      <FilterBar basePath="/board" values={values} types={TYPES} today={localToday(now)} />

      {all.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted">
          Nothing is posted right now. Post a mood or a plan above, or tell the companion in Chat
          what you are up for and it can draft one for you.
        </p>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted">
          {keywordMatched === false
            ? `Nothing on the board mentions "${values.q}".`
            : window
              ? `Nothing on the board for ${window.label}.`
              : "Nothing matches these filters."}{" "}
          Try another filter, or post your own.
        </p>
      ) : (
        <>
          {filtered && (
            <p className="text-sm text-muted">
              Showing {posts.length} of {all.length} posts.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} isMine={post.authorId === session.user.id} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PostCard({ post, isMine }: { post: BoardPost; isMine: boolean }) {
  const when = formatWhen(post.startsAt);
  const full = post.type === "plan" && post.capacity !== null && post.goingCount >= post.capacity;
  const count =
    post.type === "plan"
      ? post.capacity
        ? `${post.goingCount} of ${post.capacity} spots taken`
        : `${post.goingCount} going`
      : `${post.goingCount} in the conversation`;

  return (
    // The whole card opens the post's group chat; the name and Join stay separately clickable.
    <li className="relative flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-card p-4 hover:border-ink">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 rounded-md px-2 py-1 text-xs font-semibold ${
            post.type === "mood" ? "bg-accent text-paper" : "bg-ink text-paper"
          }`}
        >
          {post.type === "mood" ? "Mood" : "Plan"}
        </span>
        <div className="min-w-0">
          <Link href={`/plans/${post.id}`} className="after:absolute after:inset-0 after:rounded-2xl">
            <span className="block">{post.body}</span>
          </Link>
          <p className="text-sm text-muted">
            <Link href={`/people/${post.authorId}`} className="relative z-10 font-medium hover:underline">
              {isMine ? "You" : post.authorName}
            </Link>
            {[post.area, when, count].filter(Boolean).map((part) => ` · ${part}`)}
          </p>
        </div>
      </div>
      <div className="relative z-10">
        {isMine || post.joined ? (
          <Link
            href={`/plans/${post.id}`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Open group chat
          </Link>
        ) : full ? (
          <span className="text-sm text-muted">Full</span>
        ) : (
          <JoinButton postId={post.id} label={post.type === "mood" ? "Join chat" : "Join"} />
        )}
      </div>
    </li>
  );
}
