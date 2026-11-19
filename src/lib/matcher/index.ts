import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY, PICKS, RERANK_POOL } from "@/lib/config";
import { loadCandidates } from "@/lib/matcher/candidates";
import { applyHardFilters, resolveWindow, type TimeWindow } from "@/lib/matcher/filters";
import { applyNear, applyTopic } from "@/lib/matcher/focus";
import { rerank, type Pick } from "@/lib/matcher/rerank";
import { rank, type RankerVariant } from "@/lib/matcher/score";
import { loadState } from "@/lib/memory/state";
import { currentVariant, logRecEvents } from "@/lib/telemetry";

/**
 * The matcher, end to end:
 *   candidates -> hard filters -> near (optional) -> heuristic score
 *     -> topic (optional) -> LLM re-rank -> picks
 *
 * One matcher serves every source (places, events, open plans), which is what
 * lets the profile-only vs mood+profile comparison be a single flag.
 */

export interface FindPicksInput {
  from?: string;
  to?: string;
  /** What this search is for, in the user's words ("art", "a film"). */
  lookingFor?: string | null;
  /** A neighborhood or town to stay in or near. */
  near?: string | null;
  /** Memory lines passed to the re-ranker for its reasons. */
  memories: string[];
  variant?: RankerVariant;
  sourceMessageId?: string | null;
  now?: Date;
}

export interface FindPicksResult {
  window: TimeWindow;
  variant: RankerVariant;
  considered: number;
  /** Whether anything matched; null when not asked. When false, the picks are not what was asked for. */
  matched: { lookingFor: boolean | null; near: boolean | null };
  picks: Pick[];
}

export async function findPicks(
  db: SupabaseClient,
  userId: string,
  input: FindPicksInput,
): Promise<FindPicksResult> {
  const now = input.now ?? new Date();
  const variant = input.variant ?? currentVariant();

  const state = await loadState(db, userId, now);
  const window = resolveWindow({ from: input.from, to: input.to }, now, state?.timeBudgetMinutes ?? null);

  const all = await loadCandidates(db, userId, window);
  const eligible = applyHardFilters(all, {
    window,
    center: COMMUNITY.center,
    radiusKm: COMMUNITY.radiusKm,
  });

  // Focus applies to both ranker variants alike, so the comparison stays fair.
  const near = applyNear(eligible, input.near);
  const topic = applyTopic(rank(near.items, state, variant), input.lookingFor);
  const picks = await rerank(topic.items.slice(0, RERANK_POOL), {
    // The baseline must not see the mood either, or the comparison is unfair.
    state: variant === "profile_only" ? null : state,
    memories: input.memories,
    limit: PICKS,
    request: describeRequest(input.lookingFor, input.near),
  });

  await logRecEvents(
    db,
    userId,
    picks.map((p) => ({
      event: "impression" as const,
      variant,
      activityId: p.candidate.kind === "activity" ? p.candidate.id : null,
      postId: p.candidate.kind === "open_plan" ? p.candidate.id : null,
      rank: p.rank,
      score: p.score.total,
      sourceMessageId: input.sourceMessageId ?? null,
    })),
  );

  return {
    window,
    variant,
    considered: eligible.length,
    matched: { lookingFor: topic.matched, near: near.matched },
    picks,
  };
}

function describeRequest(lookingFor?: string | null, near?: string | null): string | null {
  const what = lookingFor?.trim();
  const where = near?.trim();
  if (!what && !where) return null;
  return [what ? `looking for: ${what}` : null, where ? `near: ${where}` : null].filter(Boolean).join("; ");
}
