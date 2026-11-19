import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { JoinButton } from "@/components/join-button";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { ThreadView } from "@/components/thread-view";
import { getPageSession } from "@/lib/auth";
import { getPost, listMembers, listThread } from "@/lib/board";
import { formatWhen } from "@/lib/format";
import { mapsUrl } from "@/lib/links";

export default function PlanPage({ params }: PageProps<"/plans/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <Plan params={params} />
    </Suspense>
  );
}

const LINK = "font-medium text-accent underline-offset-2 hover:underline";

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
        <Link href="/board" className={LINK}>
          Back to the board
        </Link>
      </div>
    );
  }

  const [members, messages, place] = await Promise.all([
    listMembers(session.db, post.id),
    post.joined ? listThread(session.db, post.id) : Promise.resolve([]),
    post.activityId
      ? session.db
          .from("activities")
          .select("title, venue_name, address, area, url")
          .eq("id", post.activityId)
          .maybeSingle()
          .then(({ data }) => data as { title: string; venue_name: string | null; address: string | null; area: string | null; url: string | null } | null)
      : Promise.resolve(null),
  ]);

  const when = formatWhen(post.startsAt);
  const isHost = post.authorId === session.user.id;
  const full = post.type === "plan" && post.capacity !== null && post.goingCount >= post.capacity;
  const spots = post.capacity ? `${post.goingCount} of ${post.capacity} spots taken` : `${post.goingCount} in`;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Link href="/board" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
        ← Board
      </Link>

      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-accent">
          {post.type === "mood" ? "Mood" : "Plan"} · group chat
        </p>
        <h1 className="font-serif text-2xl font-semibold">{post.body}</h1>
        <p className="text-sm text-muted">
          {[when, post.area, spots].filter(Boolean).join(" · ")}
        </p>
        {place && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">At {place.venue_name ?? place.title}</span>
            {place.url && (
              <a href={place.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                Website
              </a>
            )}
            <a
              href={mapsUrl({ title: place.title, venueName: place.venue_name, address: place.address, area: place.area })}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Open in Google Maps
            </a>
          </p>
        )}

        <div className="mt-3">
          <h2 className="text-sm font-medium text-muted">Who is in</h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {members.map((m) => (
              <li key={m.userId}>
                <Link
                  href={`/people/${m.userId}`}
                  className="inline-block rounded-full border border-line bg-paper px-3 py-1 text-sm hover:bg-sand"
                >
                  {m.userId === session.user.id ? "You" : m.name}
                  {m.role === "host" && <span className="text-muted"> · host</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {post.joined || isHost ? (
        <>
          <AutoRefresh />
          <ThreadView postId={post.id} currentUserId={session.user.id} messages={messages} />
        </>
      ) : full ? (
        <p className="rounded-2xl bg-sand p-5">This plan is full, so its group chat is closed to new people.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sand p-5">
          <p>Join to open the group chat. Joining shows your name to the group.</p>
          <JoinButton postId={post.id} label={post.type === "mood" ? "Join chat" : "Join"} />
        </div>
      )}
    </div>
  );
}
