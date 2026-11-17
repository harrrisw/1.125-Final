/**
 * Offline ranking ablation: mood + profile vs profile-only, top-3.
 *   npm run eval:ranking
 *
 * Runs the real scoring code (src/lib/matcher/score.ts) over the seed catalog
 * with no database, no embeddings and no LLM. Interest similarity is simulated
 * from tag overlap. This is the harness for the "+20% top-3 hit rate" success
 * criterion; the scenarios shipped with it are placeholders (see their note).
 */
import { loadSeedActivities } from "@/lib/integrations/seed";
import type { ActivityInput } from "@/lib/integrations/sources";
import { rank, type RankerVariant } from "@/lib/matcher/score";
import type { Candidate, CurrentState, Social } from "@/lib/types";
import scenarioFile from "./scenarios.json";

interface Scenario {
  name: string;
  interests: string[];
  dislikes: string[];
  state: { mood: string[]; energy: number | null; social: string | null; timeBudgetMinutes: number | null };
  relevant: string[];
}

const TOP_K = 3;

/** Stand-in for embedding similarity: share of the user's tags the activity carries, mapped to 0.2..0.8. */
function tagSimilarity(userTags: string[], activity: ActivityInput): number {
  if (userTags.length === 0) return 0;
  const activityTags = new Set(
    [...activity.tags, activity.category ?? ""].map((t) => t.toLowerCase()),
  );
  const matches = userTags.filter((t) => activityTags.has(t.toLowerCase())).length;
  return matches === 0 ? 0.2 : 0.2 + 0.6 * (matches / userTags.length);
}

function toCandidate(activity: ActivityInput, scenario: Scenario): Candidate {
  return {
    id: activity.externalId,
    kind: "activity",
    title: activity.title,
    description: activity.description ?? null,
    category: activity.category ?? null,
    tags: activity.tags,
    venueName: activity.venueName ?? null,
    area: activity.area ?? null,
    lat: activity.lat ?? null,
    lng: activity.lng ?? null,
    startsAt: activity.startsAt ?? null,
    durationMinutes: activity.durationMinutes ?? null,
    energy: activity.energy ?? null,
    noise: activity.noise ?? null,
    groupFit: activity.groupFit,
    url: activity.url ?? null,
    interestSim: tagSimilarity(scenario.interests, activity),
    dislikeSim: tagSimilarity(scenario.dislikes, activity),
  };
}

function toState(scenario: Scenario): CurrentState {
  return {
    mood: scenario.state.mood,
    energy: scenario.state.energy,
    social: scenario.state.social as Social | null,
    timeBudgetMinutes: scenario.state.timeBudgetMinutes,
    expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
  };
}

function topK(scenario: Scenario, activities: ActivityInput[], variant: RankerVariant): string[] {
  const candidates = activities.map((a) => toCandidate(a, scenario));
  return rank(candidates, toState(scenario), variant)
    .slice(0, TOP_K)
    .map((s) => s.candidate.id);
}

function main() {
  const activities = loadSeedActivities();
  const scenarios = scenarioFile.scenarios as Scenario[];
  const variants: RankerVariant[] = ["profile_only", "mood_profile"];
  const totals = { profile_only: { hits: 0, precision: 0 }, mood_profile: { hits: 0, precision: 0 } };

  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    for (const variant of variants) {
      const picks = topK(scenario, activities, variant);
      const relevant = picks.filter((id) => scenario.relevant.includes(id));
      totals[variant].hits += relevant.length > 0 ? 1 : 0;
      totals[variant].precision += relevant.length / TOP_K;
      const shown = picks.map((id) => (scenario.relevant.includes(id) ? `[${id}]` : id)).join(", ");
      console.log(`  ${variant.padEnd(13)} ${shown}`);
    }
  }

  const n = scenarios.length;
  console.log(`\nTop-${TOP_K} over ${n} scenarios ([brackets] above = labelled relevant)`);
  for (const variant of variants) {
    const hit = totals[variant].hits / n;
    const precision = totals[variant].precision / n;
    console.log(
      `  ${variant.padEnd(13)} hit rate ${(hit * 100).toFixed(0)}%   precision ${(precision * 100).toFixed(0)}%`,
    );
  }
  console.log(`\n${scenarioFile.note}`);
}

main();
