import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePayload, publicTextOf, summarize, type ActionType } from "@/lib/gate/actions";
import type { Card } from "@/lib/types";

/**
 * The only gate function agent tools may import. It writes a *draft* to
 * pending_actions as the signed-in user. Row-level security forces the row to
 * status 'proposed', and nothing here can move it further.
 */

export interface ProposedAction {
  id: string;
  type: ActionType;
  payload: unknown;
  expiresAt: string;
}

export async function proposeAction(
  db: SupabaseClient,
  input: {
    userId: string;
    type: ActionType;
    payload: unknown;
    sourceMessageId?: string | null;
    proposedBy?: "agent" | "user";
  },
): Promise<ProposedAction> {
  const payload = parsePayload(input.type, input.payload);

  const { data, error } = await db
    .from("pending_actions")
    .insert({
      user_id: input.userId,
      type: input.type,
      payload,
      proposed_by: input.proposedBy ?? "agent",
      source_message_id: input.sourceMessageId ?? null,
    })
    .select("id, type, payload, expires_at")
    .single();
  if (error) throw new Error(`proposeAction: ${error.message}`);

  return {
    id: data.id as string,
    type: data.type as ActionType,
    payload: data.payload,
    expiresAt: data.expires_at as string,
  };
}

/** The card the user taps. It shows the exact text that would go public. */
export function confirmCardFor(action: ProposedAction): Card {
  return {
    type: "confirm",
    actionId: action.id,
    actionType: action.type,
    summary: summarize(action.type, action.payload),
    publicText: publicTextOf(action.type, action.payload),
    expiresAt: action.expiresAt,
  };
}
