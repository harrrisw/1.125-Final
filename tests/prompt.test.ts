import { describe, expect, it } from "vitest";
import { buildTurnContext } from "@/lib/agent/prompt";
import type { SavedPlan } from "@/lib/types";

const base = { now: new Date("2026-11-21T18:00:00Z"), state: null, memories: [], history: [], drafts: [] };

const plan: SavedPlan = {
  id: "63a5aa3d-6dd9-4e8b-83b2-1a27afa59d76",
  title: "Sunday in Cambridge",
  note: null,
  createdAt: "2026-11-19T03:23:28Z",
  stops: [
    { id: "s1", activityId: "a1", title: "Harvard Art Museums", venueName: null, address: null, area: "Cambridge", lat: null, lng: null, url: null, note: null, startsAt: null },
    { id: "s2", activityId: "a2", title: "A film at the Brattle Theatre", venueName: null, address: null, area: "Harvard Square", lat: null, lng: null, url: null, note: null, startsAt: null },
  ],
};

describe("saved plans in the agent's context", () => {
  it("lists each plan with its id and stops, so the agent can replace one", () => {
    const context = buildTurnContext({ ...base, plans: [plan] });
    expect(context).toContain(
      `- "Sunday in Cambridge" (plan_id ${plan.id}): Harvard Art Museums -> A film at the Brattle Theatre`,
    );
  });

  it("says when there are none, so an undone plan is not assumed to still exist", () => {
    expect(buildTurnContext({ ...base, plans: [] })).toContain("Their saved plans: none right now.");
  });

  it("says nothing about plans when they could not be loaded", () => {
    expect(buildTurnContext({ ...base, plans: undefined })).not.toContain("saved plans");
  });
});
