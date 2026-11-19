import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { listSavedPlans, PlansNotSetUpError } from "@/lib/itineraries";
import type { SavedPlan } from "@/lib/types";

export default function PlannerPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Your plans</h1>
        <p className="text-muted">
          Outings you saved from your chats, one stop or several. Only you can see them.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Loading your plans…" />}>
        <Plans />
      </Suspense>
    </div>
  );
}

async function Plans() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  let plans: SavedPlan[];
  try {
    plans = await listSavedPlans(session.db, session.user.id);
  } catch (err) {
    if (err instanceof PlansNotSetUpError) return <NotSetUp />;
    throw err;
  }

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-muted">
        <p>No saved plans yet.</p>
        <p className="mt-1">
          In{" "}
          <Link href="/chat" className="font-medium text-accent underline-offset-2 hover:underline">
            Chat
          </Link>
          , tell the companion what you are up for. When you settle on an outing, such as tea and then a
          walk, ask it to save the plan and it will show up here with a map.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Link
            href={`/planner/${plan.id}`}
            className="block rounded-2xl border border-line bg-card p-4 hover:bg-sand"
          >
            <p className="text-xs font-medium tracking-wide text-accent">
              {plan.stops.length === 1 ? "1 stop" : `${plan.stops.length} stops`} · saved {formatDay(plan.createdAt)}
            </p>
            <p className="font-serif text-lg font-semibold">{plan.title}</p>
            <p className="text-sm text-muted">{plan.stops.map((s) => s.title).join(" → ")}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NotSetUp() {
  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <p className="font-medium">Saved plans need one more database step.</p>
      <p className="mt-1 text-sm text-muted">
        In Supabase, open the SQL editor and run the contents of supabase/migrations/0002_itineraries.sql,
        then reload this page.
      </p>
    </div>
  );
}
