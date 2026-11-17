import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embeddingsEnabled, toVectorLiteral } from "@/lib/embeddings";
import type { MemoryItem, MemoryKind } from "@/lib/types";

/**
 * Memory layer 1: the long-term profile (interests, likes, dislikes,
 * constraints, past outings). Kept for months. The user can read, edit or
 * delete every row from the Memory page, and delete is a real delete.
 */

export interface NewFact {
  kind: MemoryKind;
  content: string;
  confidence: number;
}

export function normalizeFact(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

/** Drops facts we already hold (same kind, same text after normalising) and repeats within the batch. */
export function dedupeFacts(
  incoming: NewFact[],
  existing: Pick<MemoryItem, "kind" | "content">[],
): NewFact[] {
  const seen = new Set(existing.map((m) => `${m.kind}:${normalizeFact(m.content)}`));
  const fresh: NewFact[] = [];
  for (const fact of incoming) {
    const key = `${fact.kind}:${normalizeFact(fact.content)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(fact);
  }
  return fresh;
}

interface MemoryRow {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  source_message_id: string | null;
  edited_by_user: boolean;
  created_at: string;
}

const COLUMNS = "id, kind, content, confidence, source_message_id, edited_by_user, created_at";

function fromRow(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    confidence: row.confidence,
    sourceMessageId: row.source_message_id,
    editedByUser: row.edited_by_user,
    createdAt: row.created_at,
  };
}

export async function listMemory(db: SupabaseClient, userId: string): Promise<MemoryItem[]> {
  const { data, error } = await db
    .from("memory_items")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMemory: ${error.message}`);
  return (data as MemoryRow[]).map(fromRow);
}

export async function addFacts(
  db: SupabaseClient,
  userId: string,
  facts: NewFact[],
  sourceMessageId: string | null,
): Promise<MemoryItem[]> {
  if (facts.length === 0) return [];
  const vectors = await embed(
    facts.map((f) => f.content),
    "document",
  );

  const { data, error } = await db
    .from("memory_items")
    .insert(
      facts.map((f, i) => ({
        user_id: userId,
        kind: f.kind,
        content: f.content,
        confidence: f.confidence,
        source_message_id: sourceMessageId,
        embedding: vectors ? toVectorLiteral(vectors[i]) : null,
      })),
    )
    .select(COLUMNS);
  if (error) throw new Error(`addFacts: ${error.message}`);
  return (data as MemoryRow[]).map(fromRow);
}

type Verdict = "confirmed" | "corrected" | "rejected";

/** Records the user's verdict without the memory text, so the accuracy metric outlives a delete. */
async function recordFeedback(
  db: SupabaseClient,
  userId: string,
  kind: MemoryKind,
  verdict: Verdict,
): Promise<void> {
  const { error } = await db
    .from("memory_feedback")
    .insert({ user_id: userId, memory_kind: kind, verdict });
  if (error) console.error(`recordFeedback: ${error.message}`);
}

async function getKind(db: SupabaseClient, id: string): Promise<MemoryKind | null> {
  const { data } = await db.from("memory_items").select("kind").eq("id", id).maybeSingle();
  return (data?.kind as MemoryKind | undefined) ?? null;
}

export async function confirmMemory(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const kind = await getKind(db, id);
  if (kind) await recordFeedback(db, userId, kind, "confirmed");
}

export async function updateMemory(
  db: SupabaseClient,
  userId: string,
  id: string,
  content: string,
): Promise<MemoryItem | null> {
  const vectors = await embed([content], "document");
  const { data, error } = await db
    .from("memory_items")
    .update({
      content,
      edited_by_user: true,
      confidence: 1,
      updated_at: new Date().toISOString(),
      ...(vectors ? { embedding: toVectorLiteral(vectors[0]) } : {}),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`updateMemory: ${error.message}`);
  if (!data) return null;
  const item = fromRow(data as MemoryRow);
  await recordFeedback(db, userId, item.kind, "corrected");
  return item;
}

export async function deleteMemory(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const kind = await getKind(db, id);
  if (!kind) return false;
  const { error } = await db.from("memory_items").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`deleteMemory: ${error.message}`);
  await recordFeedback(db, userId, kind, "rejected");
  return true;
}

/**
 * The memories most relevant to what the user just said. With embeddings this
 * is a similarity search; without, the most recent ones.
 */
export async function recall(
  db: SupabaseClient,
  userId: string,
  queryText: string,
  limit: number,
): Promise<Pick<MemoryItem, "id" | "kind" | "content">[]> {
  if (embeddingsEnabled()) {
    const vectors = await embed([queryText], "query");
    if (vectors) {
      const { data, error } = await db.rpc("match_memories", {
        p_query: toVectorLiteral(vectors[0]),
        p_limit: limit,
      });
      if (error) throw new Error(`recall: ${error.message}`);
      const matched = data as { id: string; kind: MemoryKind; content: string }[];
      if (matched.length > 0) return matched;
    }
  }
  const all = await listMemory(db, userId);
  return all.slice(0, limit).map(({ id, kind, content }) => ({ id, kind, content }));
}
