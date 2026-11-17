import Link from "next/link";

const PROBLEMS = [
  { title: "Mood-aware", body: "Picks follow how you feel tonight, not only what you did last month." },
  { title: "It remembers", body: "What you like is kept between chats, and you can edit or delete any of it." },
  { title: "Not solo by default", body: "See open plans near you and join one, or share your own." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-5">
        <h1 className="font-serif text-6xl font-semibold tracking-tight">Offhours</h1>
        <p className="max-w-xl text-xl leading-relaxed text-muted">
          A companion for free time that learns your moods and interests, and lets you join what
          others are up to.
        </p>
        <div className="flex gap-3">
          <Link
            href="/chat"
            className="rounded-full bg-ink px-6 py-3 font-medium text-paper hover:opacity-90"
          >
            Open the app
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-line bg-card px-6 py-3 font-medium hover:bg-sand"
          >
            Sign in
          </Link>
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {PROBLEMS.map((p) => (
          <li key={p.title} className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-serif text-lg font-semibold">{p.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted">
        Pilot: students around Boston. Sign-in needs a school email address. Nothing you tell the
        companion is public unless you choose to post it.
      </p>
    </main>
  );
}
