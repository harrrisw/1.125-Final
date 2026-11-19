import Link from "next/link";
import type { BoardPost } from "@/lib/board";
import { COMMUNITY } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import type { Profile } from "@/lib/profiles";

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-line bg-paper px-3 py-1 text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

const moodUntil = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: COMMUNITY.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** A profile as other members see it. Only what the person chose to show. */
export function ProfileCard({ profile, posts = [], isMe = false }: { profile: Profile; posts?: BoardPost[]; isMe?: boolean }) {
  const empty = !profile.bio && profile.hobbies.length === 0 && profile.preferences.length === 0 && !profile.mood;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-line bg-card p-5">
        <h1 className="font-serif text-3xl font-semibold">{profile.displayName}</h1>
        {profile.homeArea && <p className="text-sm text-muted">Around {profile.homeArea}</p>}

        {profile.mood && profile.moodExpiresAt && (
          <p className="mt-3 inline-flex flex-wrap items-baseline gap-x-2 rounded-2xl bg-sand px-4 py-2">
            <span className="text-xs font-medium tracking-wide text-accent">Right now</span>
            <span>{profile.mood}</span>
            <span className="text-xs text-muted">until {moodUntil(profile.moodExpiresAt)}</span>
          </p>
        )}

        {profile.bio && <p className="mt-3 whitespace-pre-wrap">{profile.bio}</p>}

        {profile.hobbies.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-1 text-sm font-medium text-muted">Hobbies</h2>
            <Chips items={profile.hobbies} />
          </div>
        )}
        {profile.preferences.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-1 text-sm font-medium text-muted">Likes to</h2>
            <Chips items={profile.preferences} />
          </div>
        )}

        {empty && (
          <p className="mt-3 text-muted">
            {isMe ? "Your profile is empty. Add a bio and some hobbies so people know who they are meeting." : "Nothing here yet."}
          </p>
        )}
      </section>

      {posts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-serif text-xl font-semibold">On the board now</h2>
          <ul className="flex flex-col gap-2">
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/plans/${post.id}`} className="block rounded-2xl border border-line bg-card p-4 hover:border-ink">
                  <span className="text-xs font-semibold text-accent">{post.type === "mood" ? "Mood" : "Plan"}</span>
                  <span className="block">{post.body}</span>
                  <span className="text-sm text-muted">
                    {[post.area, formatWhen(post.startsAt), `${post.goingCount} in`].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
