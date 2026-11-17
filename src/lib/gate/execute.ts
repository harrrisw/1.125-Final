import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_ACTION_TYPES,
  parsePayload,
  publicTextOf,
  type ActionType,
} from "@/lib/gate/actions";
import { calendarTemplateUrl } from "@/lib/integrations/calendar";
import { moderatePublicText } from "@/lib/safety/moderation";
import { logRecEvent } from "@/lib/telemetry";

/**
 * The other side of the gate. Called only from HTTP endpoints that a person
 * triggers by tapping a button. Agent code must never import this file; the
 * test in tests/gate.test.ts checks that.
 *
 * Order matters:
 *   1. confirm  - as the user. The database checks auth.uid() owns the draft.
 *   2. moderate - anything that would become public. Fails closed.
 *   3. execute  - as the service role, atomically, inside the database.
 */

export type ExecuteResult =
  | { ok: true; type: ActionType; postId?: string; calendarUrl?: string }
  | { ok: false; reason: string };

const CHECK_VIOLATION = "23514";

async function markFailed(adminDb: SupabaseClient, actionId: string, reason: string): Promise<void> {
  const { error } = await adminDb
    .from("pending_actions")
    .update({ status: "failed", result: { reason } })
    .eq("id", actionId)
    .eq("status", "confirmed");
  if (error) console.error(`markFailed: ${error.message}`);
}

export async function confirmAndExecute(
  sessionDb: SupabaseClient,
  adminDb: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<ExecuteResult> {
  const { data: action, error: confirmError } = await sessionDb.rpc("confirm_pending_action", {
    p_action_id: actionId,
  });
  if (confirmError || !action) {
    return { ok: false, reason: "This draft has expired or was already handled." };
  }

  const type = action.type as ActionType;

  try {
    const publicText = publicTextOf(type, action.payload);
    if (publicText !== null) {
      const verdict = await moderatePublicText(publicText);
      if (!verdict.allowed) {
        await markFailed(adminDb, actionId, verdict.reason);
        return { ok: false, reason: verdict.reason };
      }
    }

    if (PUBLIC_ACTION_TYPES.has(type)) {
      const { data, error } = await adminDb.rpc("execute_public_action", {
        p_action_id: actionId,
      });
      if (error) {
        // check_violation messages are written for people ("this plan is full").
        const reason =
          error.code === CHECK_VIOLATION ? sentence(error.message) : "That did not go through. Try again.";
        await markFailed(adminDb, actionId, reason);
        return { ok: false, reason };
      }
      const postId = (data as { post_id: string }).post_id;
      // Only joining someone else's post counts toward the pilot's join rate.
      // Hosting is counted from the posts table (author_id, type = 'plan').
      if (type === "join_post") {
        await logRecEvent(sessionDb, userId, { event: "join", postId });
      }
      return { ok: true, type, postId };
    }

    // calendar_add: until Google OAuth is wired up, hand back a prefilled
    // "add to calendar" link that the user saves in their own browser.
    const calendarUrl = calendarTemplateUrl(parsePayload("calendar_add", action.payload));
    const { error } = await adminDb
      .from("pending_actions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        result: { calendar_url: calendarUrl },
      })
      .eq("id", actionId)
      .eq("status", "confirmed");
    if (error) throw new Error(`calendar_add: ${error.message}`);
    return { ok: true, type, calendarUrl };
  } catch (err) {
    await markFailed(adminDb, actionId, "Unexpected error while carrying this out.");
    throw err;
  }
}

function sentence(message: string): string {
  const trimmed = message.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + (trimmed.endsWith(".") ? "" : ".");
}

export async function cancelAction(sessionDb: SupabaseClient, actionId: string): Promise<boolean> {
  const { error } = await sessionDb.rpc("cancel_pending_action", { p_action_id: actionId });
  return !error;
}
