import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, ChatMessage } from "@/lib/types";

/** Private chat history. One rolling conversation per user. */

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: Card[] | null;
  created_at: string;
}

const COLUMNS = "id, role, content, cards, created_at";

function fromRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    cards: row.cards ?? [],
    createdAt: row.created_at,
  };
}

export async function insertMessage(
  db: SupabaseClient,
  userId: string,
  role: "user" | "assistant",
  content: string,
  cards: Card[] = [],
): Promise<ChatMessage> {
  const { data, error } = await db
    .from("messages")
    .insert({ user_id: userId, role, content, cards })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`insertMessage: ${error.message}`);
  return fromRow(data as MessageRow);
}

/** The most recent messages, oldest first. */
export async function loadMessages(
  db: SupabaseClient,
  userId: string,
  limit: number,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`loadMessages: ${error.message}`);
  return (data as MessageRow[]).map(fromRow).reverse();
}

/** What became of a draft, for re-drawing a confirm card after a reload. */
export interface ActionState {
  status: string;
  result: { post_id?: string; calendar_url?: string; reason?: string } | null;
}

export async function loadActionStates(
  db: SupabaseClient,
  actionIds: string[],
): Promise<Record<string, ActionState>> {
  if (actionIds.length === 0) return {};
  const { data, error } = await db
    .from("pending_actions")
    .select("id, status, result")
    .in("id", actionIds);
  if (error) throw new Error(`loadActionStates: ${error.message}`);
  const states: Record<string, ActionState> = {};
  for (const row of data as { id: string; status: string; result: ActionState["result"] }[]) {
    states[row.id] = { status: row.status, result: row.result };
  }
  return states;
}

export interface DraftStatus {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

/** Recent drafts and what became of them, so the agent never guesses whether the user confirmed. */
export async function loadRecentDrafts(
  db: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<DraftStatus[]> {
  const { data, error } = await db
    .from("pending_actions")
    .select("id, type, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`loadRecentDrafts: ${error.message}`);
  return (data as { id: string; type: string; status: string; created_at: string }[]).map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
  }));
}
