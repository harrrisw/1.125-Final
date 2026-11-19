import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotSetUp, SocialNotSetUpError } from "@/lib/profiles";
import { moderateDirectMessage } from "@/lib/safety/moderation";

/**
 * Direct messages between two members. Reads go through the session client,
 * where row-level security shows a conversation only to the two people in it
 * and hides it once either has blocked the other. Sending is moderated, then
 * done by send_direct_message() with the service role.
 */

export interface InboxEntry {
  id: string;
  otherId: string;
  otherName: string;
  lastMessageAt: string;
  lastBody: string | null;
  lastFromMe: boolean;
  unread: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  otherId: string;
  otherName: string;
  messages: DirectMessage[];
}

function failRead(where: string, error: { code?: string; message: string }): never {
  if (isNotSetUp(error)) throw new SocialNotSetUpError();
  throw new Error(`${where}: ${error.message}`);
}

export async function listInbox(db: SupabaseClient, userId: string): Promise<InboxEntry[]> {
  const { data, error } = await db
    .from("dm_inbox")
    .select("id, other_id, other_name, last_message_at, last_body, last_sender_id, unread")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) failRead("listInbox", error);
  return (
    data as {
      id: string;
      other_id: string;
      other_name: string;
      last_message_at: string;
      last_body: string | null;
      last_sender_id: string | null;
      unread: boolean;
    }[]
  ).map((row) => ({
    id: row.id,
    otherId: row.other_id,
    otherName: row.other_name,
    lastMessageAt: row.last_message_at,
    lastBody: row.last_body,
    lastFromMe: row.last_sender_id === userId,
    unread: row.unread,
  }));
}

export async function unreadCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from("dm_inbox").select("id", { count: "exact", head: true }).eq("unread", true);
  if (error) return 0;
  return count ?? 0;
}

/** The conversation, or null when it does not exist, is not yours, or is hidden by a block. */
export async function getConversation(
  db: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<Conversation | null> {
  const { data: thread, error } = await db
    .from("dm_threads")
    .select("id, user_a, user_b")
    .eq("id", threadId)
    .maybeSingle();
  if (error) failRead("getConversation", error);
  if (!thread) return null;

  const otherId = thread.user_a === userId ? (thread.user_b as string) : (thread.user_a as string);
  const [{ data: profile }, { data: rows, error: messagesError }] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", otherId).maybeSingle(),
    db
      .from("dm_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);
  if (messagesError) failRead("getConversation", messagesError);

  return {
    id: thread.id as string,
    otherId,
    otherName: (profile?.display_name as string | undefined) ?? "Member",
    messages: (rows as { id: string; sender_id: string; body: string; created_at: string }[]).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

/** The existing conversation between two members, if any. */
export async function findConversationWith(
  db: SupabaseClient,
  userId: string,
  otherId: string,
): Promise<string | null> {
  const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
  const { data, error } = await db.from("dm_threads").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
  if (error) failRead("findConversationWith", error);
  return (data?.id as string | undefined) ?? null;
}

export async function markRead(db: SupabaseClient, threadId: string): Promise<void> {
  const { error } = await db.rpc("mark_dm_read", { p_thread_id: threadId });
  if (error && !isNotSetUp(error)) throw new Error(`markRead: ${error.message}`);
}

export type SendResult = { ok: true; threadId: string } | { ok: false; status: number; reason: string };

const CHECK_VIOLATION = "23514";

export async function sendDirectMessage(
  adminDb: SupabaseClient,
  senderId: string,
  recipientId: string,
  body: string,
): Promise<SendResult> {
  if (senderId === recipientId) return { ok: false, status: 400, reason: "You cannot message yourself." };

  const verdict = await moderateDirectMessage(body);
  if (!verdict.allowed) return { ok: false, status: 422, reason: verdict.reason };

  const { data, error } = await adminDb.rpc("send_direct_message", {
    p_sender: senderId,
    p_recipient: recipientId,
    p_body: body,
  });
  if (error) {
    if (isNotSetUp(error)) throw new SocialNotSetUpError();
    if (error.code === CHECK_VIOLATION) {
      const reason = error.message.charAt(0).toUpperCase() + error.message.slice(1);
      return { ok: false, status: 403, reason: reason.endsWith(".") ? reason : `${reason}.` };
    }
    throw new Error(`sendDirectMessage: ${error.message}`);
  }
  return { ok: true, threadId: data as string };
}
