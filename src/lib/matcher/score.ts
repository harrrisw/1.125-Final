import type { Candidate, CurrentState } from "@/lib/types";

/**
 * The matcher's scoring step. Pure and deterministic so it can be unit-tested
 * and run offline by the ranking eval.
 *
 *   total = w.interest * interest + w.mood * moodFit + w.social * socialFit - dislike penalty
 *
 * "profile_only" drops the mood and social terms. That is the baseline for the
 * "+20% top-3 hit rate, mood + profile vs profile-only" success criterion.
 */

export type RankerVariant = "mood_profile" | "profile_only";

export interface Weights {
  interest: number;
  mood: number;
  social: number;
  dislike: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  interest: 0.45,
  mood: 0.35,
  social: 0.2,
  dislike: 0.5,
};

/** Returned when there is nothing to compare, so a missing signal neither helps nor hurts. */
const NEUTRAL = 0.5;

/**
 * Unrelated texts still have some cosine similarity, so the dislike penalty
 * only starts above this floor. Tune it once real embeddings are in.
 */
const DISLIKE_FLOOR = 0.45;

const CALM_WORDS = new Set([
  "tired", "calm", "quiet", "stressed", "drained", "overwhelmed", "low", "anxious",
  "sleepy", "mellow", "relaxed", "sad", "worn out", "burnt out", "burned out", "exhausted",
]);

const LIVELY_WORDS = new Set([
  "adventurous", "energetic", "excited", "social", "restless", "celebrating",
  "playful", "hyped", "bold", "spontaneous",
]);

export interface ScoreBreakdown {
  interest: number;
  mood: number;
  social: number;
  penalty: number;
  total: number;
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: ScoreBreakdown;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** 1 when two 1-5 ratings are equal, 0 when they are at opposite ends. */
function closeness(a: number, b: number): number {
  return 1 - Math.min(Math.abs(a - b), 4) / 4;
}

function moodLean(state: CurrentState): "calm" | "lively" | null {
  let calm = 0;
  let lively = 0;
  for (const word of state.mood) {
    const w = word.trim().toLowerCase();
    if (CALM_WORDS.has(w)) calm++;
    if (LIVELY_WORDS.has(w)) lively++;
  }
  if (calm === lively) return null;
  return calm > lively ? "calm" : "lively";
}

function desiredEnergy(state: CurrentState): number | null {
  if (state.energy !== null) return state.energy;
  const lean = moodLean(state);
  if (lean === "calm") return 2;
  if (lean === "lively") return 4;
  return null;
}

function desiredNoise(state: CurrentState): number | null {
  const lean = moodLean(state);
  if (lean === "calm") return 1.5;
  if (lean === "lively") return 3.5;
  return state.energy;
}

function timeFit(budgetMinutes: number, durationMinutes: number): number {
  if (durationMinutes <= budgetMinutes) return 1;
  return Math.max(0, 1 - (durationMinutes - budgetMinutes) / budgetMinutes);
}

/** How well an option suits the user's energy, noise tolerance and free time. 0..1. */
export function moodFit(state: CurrentState | null, c: Candidate): number {
  if (!state) return NEUTRAL;
  const parts: number[] = [];

  const energy = desiredEnergy(state);
  if (energy !== null && c.energy !== null) parts.push(closeness(energy, c.energy));

  const noise = desiredNoise(state);
  if (noise !== null && c.noise !== null) parts.push(closeness(noise, c.noise));

  if (state.timeBudgetMinutes !== null && c.durationMinutes !== null) {
    parts.push(timeFit(state.timeBudgetMinutes, c.durationMinutes));
  }

  if (parts.length === 0) return NEUTRAL;
  return parts.reduce((sum, p) => sum + p, 0) / parts.length;
}

/** How well an option suits who the user wants to be around. 0..1. */
export function socialFit(state: CurrentState | null, c: Candidate): number {
  const want = state?.social ?? null;
  if (want === null) return NEUTRAL;

  if (c.kind === "open_plan") {
    // Someone else's plan is the best answer when you want company, and the
    // wrong one when you want to be alone.
    return want === "solo" ? 0.1 : 1;
  }
  if (!c.groupFit.includes(want)) return 0.25;
  // A place that suits groups still leaves you to find the group yourself.
  return want === "solo" ? 1 : 0.8;
}

export function scoreCandidate(
  c: Candidate,
  state: CurrentState | null,
  variant: RankerVariant = "mood_profile",
  weights: Weights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  const interest = clamp01(c.interestSim);
  const overFloor = Math.max(0, clamp01(c.dislikeSim) - DISLIKE_FLOOR) / (1 - DISLIKE_FLOOR);
  const penalty = weights.dislike * overFloor;

  if (variant === "profile_only") {
    return { interest, mood: 0, social: 0, penalty, total: interest - penalty };
  }

  const mood = moodFit(state, c);
  const social = socialFit(state, c);
  const total =
    weights.interest * interest + weights.mood * mood + weights.social * social - penalty;
  return { interest, mood, social, penalty, total };
}

/** Best first. Ties break on soonest start, then id, so the order is stable. */
export function rank(
  candidates: Candidate[],
  state: CurrentState | null,
  variant: RankerVariant = "mood_profile",
  weights: Weights = DEFAULT_WEIGHTS,
): ScoredCandidate[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, state, variant, weights) }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const aStart = a.candidate.startsAt ?? "9999";
      const bStart = b.candidate.startsAt ?? "9999";
      if (aStart !== bStart) return aStart < bStart ? -1 : 1;
      return a.candidate.id < b.candidate.id ? -1 : 1;
    });
}
