import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY, PICKS, RERANK_POOL } from "@/lib/config";
import { loadCandidates } from "@/lib/matcher/candidates";
import { applyHardFilters, resolveWindow, type TimeWindow } from "@/lib/matcher/filters";
import { rerank, type Pick } from "@/lib/matcher/rerank";
import { rank, type RankerVariant } from "@/lib/matcher/score";
import { loadState } from "@/lib/memory/state";
import { currentVariant, logRecEvents } from "@/lib/telemetry";

/**
 * The matcher, end to end:
 *   candidates -> hard filters -> heuristic score -> LLM re-rank -> picks
 *
 * One matcher serves every source (places, events, open plans), which is what
 * lets the profile-only vs mood+profile comparison be a single flag.
 */

export interface FindPicksInput {
  from?: string;
  to?: string;
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

  const ranked = rank(eligible, state, variant);
  const picks = await rerank(ranked.slice(0, RERANK_POOL), {
    // The baseline must not see the mood either, or the comparison is unfair.
    state: variant === "profile_only" ? null : state,
    memories: input.memories,
    limit: PICKS,
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

  return { window, variant, considered: eligible.length, picks };
}
