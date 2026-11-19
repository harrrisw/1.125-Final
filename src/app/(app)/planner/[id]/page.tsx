import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PlanView } from "@/components/plan-view";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { getSavedPlan, PlansNotSetUpError } from "@/lib/itineraries";
import type { SavedPlan } from "@/lib/types";

export default function SavedPlanPage({ params }: PageProps<"/planner/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading the plan…" />}>
      <SavedPlanBody params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function SavedPlanBody({ params }: Pick<PageProps<"/planner/[id]">, "params">) {
  const { id } = await params;
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  let plan: SavedPlan | null = null;
  try {
    plan = UUID.test(id) ? await getSavedPlan(session.db, session.user.id, id) : null;
  } catch (err) {
    if (!(err instanceof PlansNotSetUpError)) throw err;
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <p>This plan is not in your saved plans.</p>
        <Link href="/planner" className="font-medium text-accent underline-offset-2 hover:underline">
          Back to your plans
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link href="/planner" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
        ← All plans
      </Link>
      <PlanView plan={plan} />
    </div>
  );
}
