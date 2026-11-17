import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankerVariant } from "@/lib/matcher/score";

/**
 * Recommendation telemetry. The pilot's numbers come from here:
 * - top-3 hit rate per ranker variant (impression -> click / propose / join)
 * - pilot join rate (users with at least one "join" event)
 */

export type RecEventName = "impression" | "click" | "propose" | "join" | "dismiss";

export function currentVariant(): RankerVariant {
  return process.env.OFFHOURS_RANKER_VARIANT === "profile_only" ? "profile_only" : "mood_profile";
}

export interface RecEventInput {
  event: RecEventName;
  variant?: RankerVariant;
  activityId?: string | null;
  postId?: string | null;
  rank?: number;
  score?: number;
  sourceMessageId?: string | null;
}

/** Telemetry never breaks a user-facing flow: failures are logged and swallowed. */
export async function logRecEvents(
  db: SupabaseClient,
  userId: string,
  events: RecEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  const { error } = await db.from("rec_events").insert(
    events.map((e) => ({
      user_id: userId,
      event: e.event,
      ranker_variant: e.variant ?? currentVariant(),
      activity_id: e.activityId ?? null,
      post_id: e.postId ?? null,
      rank: e.rank ?? null,
      score: e.score ?? null,
      source_message_id: e.sourceMessageId ?? null,
    })),
  );
  if (error) console.error(`logRecEvents: ${error.message}`);
}

export function logRecEvent(db: SupabaseClient, userId: string, event: RecEventInput): Promise<void> {
  return logRecEvents(db, userId, [event]);
}
