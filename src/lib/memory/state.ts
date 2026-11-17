import type { SupabaseClient } from "@supabase/supabase-js";
import { STATE_TTL_HOURS } from "@/lib/config";
import type { CurrentState, Social } from "@/lib/types";

/**
 * Memory layer 2: current state (mood, energy, who you want around, free time).
 * One row per user. It expires after a few hours and is ignored once stale, so
 * last night's "exhausted" never colours this afternoon's picks.
 */

export interface StateSignal {
  mood: string[];
  energy: number | null;
  social: Social | null;
  timeBudgetMinutes: number | null;
}

export function hasSignal(s: StateSignal): boolean {
  return (
    s.mood.length > 0 || s.energy !== null || s.social !== null || s.timeBudgetMinutes !== null
  );
}

export function isLive(state: CurrentState | null, now: Date): state is CurrentState {
  return state !== null && new Date(state.expiresAt).getTime() > now.getTime();
}

export function clampEnergy(n: number | null): number | null {
  if (n === null || Number.isNaN(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Folds what the user just said into the live state.
 * - No signal in this message: keep what we had and do not extend its life.
 * - Some signal: new values win field by field, and the clock restarts.
 */
export function mergeState(
  prev: CurrentState | null,
  next: StateSignal,
  now: Date,
  ttlHours: number = STATE_TTL_HOURS,
): CurrentState | null {
  const live = isLive(prev, now) ? prev : null;
  if (!hasSignal(next)) return live;

  return {
    mood: next.mood.length > 0 ? next.mood.slice(0, 3) : (live?.mood ?? []),
    energy: clampEnergy(next.energy) ?? live?.energy ?? null,
    social: next.social ?? live?.social ?? null,
    timeBudgetMinutes: next.timeBudgetMinutes ?? live?.timeBudgetMinutes ?? null,
    expiresAt: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
  };
}

interface StateRow {
  mood: string[];
  energy: number | null;
  social: Social | null;
  time_budget_minutes: number | null;
  expires_at: string;
}

function fromRow(row: StateRow): CurrentState {
  return {
    mood: row.mood ?? [],
    energy: row.energy,
    social: row.social,
    timeBudgetMinutes: row.time_budget_minutes,
    expiresAt: row.expires_at,
  };
}

export async function loadState(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<CurrentState | null> {
  const { data, error } = await db
    .from("current_state")
    .select("mood, energy, social, time_budget_minutes, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`loadState: ${error.message}`);
  if (!data) return null;
  const state = fromRow(data as StateRow);
  return isLive(state, now) ? state : null;
}

export async function saveState(
  db: SupabaseClient,
  userId: string,
  state: CurrentState,
  sourceMessageId: string | null,
): Promise<void> {
  const { error } = await db.from("current_state").upsert({
    user_id: userId,
    mood: state.mood,
    energy: state.energy,
    social: state.social,
    time_budget_minutes: state.timeBudgetMinutes,
    source_message_id: sourceMessageId,
    updated_at: new Date().toISOString(),
    expires_at: state.expiresAt,
  });
  if (error) throw new Error(`saveState: ${error.message}`);
}

export async function clearState(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.from("current_state").delete().eq("user_id", userId);
  if (error) throw new Error(`clearState: ${error.message}`);
}
