import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { JoinButton } from "@/components/join-button";
import { MapToggle } from "@/components/map-toggle";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { listBoard, type BoardPost } from "@/lib/board";
import { EXPLORE_MOODS, explore, moodById, postCandidate } from "@/lib/explore";
import { formatWhen } from "@/lib/format";
import { hasCoords, mapsUrl } from "@/lib/links";
import { loadActivities } from "@/lib/matcher/candidates";
import { loadState } from "@/lib/memory/state";
import type { Candidate } from "@/lib/types";
import { localToday, resolveWhen } from "@/lib/when";

const MAX_PLACES = 12;
const LINK = "font-medium text-accent underline-offset-2 hover:underline";
const DEFAULT_SPAN_MS = 14 * 86_400_000;

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Explore</h1>
        <p className="text-muted">
          Browse places, events and open plans by mood, keyword or date. Or tell the companion in Chat
          and it will pick for you.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Finding things to do…" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

async function Results({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const params = await searchParams;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const now = new Date();
  const values = { mood: one(params.mood), q: one(params.q), when: one(params.when) ?? "any", date: one(params.date) };
  const mood = moodById(values.mood);
  const window = resolveWhen(values.when, values.date, now);
  const loadWindow = { from: window?.from ?? now, to: window?.to ?? new Date(now.getTime() + DEFAULT_SPAN_MS) };

  const [activities, board, state] = await Promise.all([
    loadActivities(session.db, loadWindow),
    listBoard(session.db, 100),
    loadState(session.db, session.user.id),
  ]);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const others = board.filter((p) => p.authorId !== session.user.id);
  const postById = new Map(others.map((p) => [p.id, p]));
  const posts = others.map((post) => ({
    post,
    candidate: postCandidate(post, post.activityId ? byId.get(post.activityId) : undefined),
  }));

  const result = explore(activities, posts, { mood, q: values.q, window }, state, now);
  const places = result.places.slice(0, MAX_PLACES).map((s) => s.candidate);
  const filtered = Boolean(mood || values.q || window);

  const heading = filtered
    ? [mood && mood.label.toLowerCase(), values.q && `"${values.q}"`, window?.label].filter(Boolean).join(", ")
    : state
      ? "your mood right now"
      : null;

  return (
    <div className="flex flex-col gap-5">
      <FilterBar
        basePath="/explore"
        values={values}
        // Only the labels go to the browser; the matching rules stay on the server.
        moods={EXPLORE_MOODS.map(({ id, label, hint }) => ({ id, label, hint }))}
        today={localToday(now)}
      />

      {heading && (
        <p className="text-sm text-muted">
          {filtered ? "Showing" : "Ordered for"} {heading}
          {!filtered && ". Your mood is private; it only changes the order here."}
          {filtered && "."}
        </p>
      )}

      {window && window.from >= window.to && <p className="text-muted">That time has already passed.</p>}

      {result.keywordMatched === false ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted">
          Nothing matches &ldquo;{values.q}&rdquo;. Try a broader word, or ask the companion in Chat.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-serif text-xl font-semibold">Open plans and moods</h2>
            {result.posts.length === 0 ? (
              <p className="text-sm text-muted">
                No one has posted anything that fits.{" "}
                <Link href="/board#compose" className={LINK}>
                  Post your own
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.posts.map((s) => {
                  const post = postById.get(s.candidate.id);
                  return post ? <PostRow key={post.id} post={post} /> : null;
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-serif text-xl font-semibold">Places and events</h2>
            {places.length === 0 ? (
              <p className="text-sm text-muted">Nothing in the catalog fits these filters.</p>
            ) : (
              <>
                <ol className="flex flex-col gap-2">
                  {places.map((place, i) => (
                    <PlaceRow key={place.id} place={place} number={i + 1} />
                  ))}
                </ol>
                {result.places.length > MAX_PLACES && (
                  <p className="text-sm text-muted">
                    Showing the best {MAX_PLACES} of {result.places.length}. Narrow it with a mood or keyword.
                  </p>
                )}
                <MapToggle
                  label="Map of these places"
                  places={places.filter(hasCoords).map((p) => ({
                    id: p.id,
                    label: String(places.indexOf(p) + 1),
                    title: p.title,
                    subtitle: p.area,
                    lat: p.lat,
                    lng: p.lng,
                    href: mapsUrl(p),
                  }))}
                />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PostRow({ post }: { post: BoardPost }) {
  const count = post.capacity ? `${post.goingCount} of ${post.capacity} going` : `${post.goingCount} in`;
  return (
    <li className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 hover:border-ink">
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold text-accent">{post.type === "mood" ? "Mood" : "Plan"}</span>
        <Link href={`/plans/${post.id}`} className="block after:absolute after:inset-0 after:rounded-2xl">
          {post.body}
        </Link>
        <p className="text-sm text-muted">
          <Link href={`/people/${post.authorId}`} className="relative z-10 font-medium hover:underline">
            {post.authorName}
          </Link>
          {[post.area, formatWhen(post.startsAt), count].filter(Boolean).map((part) => ` · ${part}`)}
        </p>
      </div>
      <div className="relative z-10">
        {post.joined ? (
          <Link href={`/plans/${post.id}`} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            Open group chat
          </Link>
        ) : (
          <JoinButton postId={post.id} label={post.type === "mood" ? "Join chat" : "Join"} />
        )}
      </div>
    </li>
  );
}

function PlaceRow({ place, number }: { place: Candidate; number: number }) {
  const when = formatWhen(place.startsAt);
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-card p-4">
      <span className="offhours-pin mt-0.5 shrink-0" aria-hidden="true">
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-accent">
          {[place.area, when ?? place.category].filter(Boolean).join(" · ")}
        </p>
        <h3 className="font-serif text-lg font-semibold">{place.title}</h3>
        {place.description && <p className="text-sm text-muted">{place.description}</p>}
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {place.url && (
            <a href={place.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              Website
            </a>
          )}
          <a href={mapsUrl(place)} target="_blank" rel="noopener noreferrer" className={LINK}>
            Open in Google Maps
          </a>
          <Link href={`/board?activity=${place.id}#compose`} className={LINK}>
            Post a plan here
          </Link>
        </p>
      </div>
    </li>
  );
}
