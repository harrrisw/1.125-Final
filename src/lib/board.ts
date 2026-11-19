import type { SupabaseClient } from "@supabase/supabase-js";
import { moderatePublicText } from "@/lib/safety/moderation";

/**
 * The public zone, read side plus plan-chat posting. Reads go through the
 * session client (RLS hides blocked users and non-members' chats). The only
 * writes here are plan-chat messages, which a member types themselves and
 * which are moderated before the service role inserts them.
 */

export interface BoardPost {
  id: string;
  type: "mood" | "plan";
  body: string;
  area: string | null;
  startsAt: string | null;
  capacity: number | null;
  activityId: string | null;
  authorId: string;
  authorName: string;
  goingCount: number;
  joined: boolean;
  createdAt: string;
  expiresAt: string;
}

interface BoardRow {
  id: string;
  type: "mood" | "plan";
  body: string;
  area: string | null;
  starts_at: string | null;
  capacity: number | null;
  activity_id: string | null;
  author_id: string;
  author_name: string;
  going_count: number;
  joined: boolean;
  created_at: string;
  expires_at: string;
}

function fromRow(row: BoardRow): BoardPost {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    area: row.area,
    startsAt: row.starts_at,
    capacity: row.capacity,
    activityId: row.activity_id,
    authorId: row.author_id,
    authorName: row.author_name,
    goingCount: Number(row.going_count),
    joined: row.joined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function listBoard(db: SupabaseClient, limit = 50): Promise<BoardPost[]> {
  const { data, error } = await db
    .from("board_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listBoard: ${error.message}`);
  return (data as BoardRow[]).map(fromRow);
}

export async function getPost(db: SupabaseClient, postId: string): Promise<BoardPost | null> {
  const { data, error } = await db.from("board_feed").select("*").eq("id", postId).maybeSingle();
  if (error) throw new Error(`getPost: ${error.message}`);
  return data ? fromRow(data as BoardRow) : null;
}

export interface Member {
  userId: string;
  name: string;
  role: "host" | "member";
}

/** Who is in a post's group, host first, then in the order they joined. */
export async function listMembers(db: SupabaseClient, postId: string): Promise<Member[]> {
  const { data, error } = await db
    .from("memberships")
    .select("user_id, role, joined_at")
    .eq("post_id", postId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`listMembers: ${error.message}`);
  const rows = data as { user_id: string; role: "host" | "member" }[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, display_name")
    .in("id", rows.map((r) => r.user_id));
  if (profileError) throw new Error(`listMembers: ${profileError.message}`);
  const names = new Map((profiles as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));

  return rows
    .map((r) => ({ userId: r.user_id, name: names.get(r.user_id) ?? "Member", role: r.role }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "host" ? -1 : 1));
}

export interface ThreadMessage {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export async function listThread(db: SupabaseClient, postId: string): Promise<ThreadMessage[]> {
  const { data, error } = await db
    .from("thread_messages")
    .select("id, user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`listThread: ${error.message}`);
  const rows = data as { id: string; user_id: string; body: string; created_at: string }[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, display_name")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  if (profileError) throw new Error(`listThread: ${profileError.message}`);
  const names = new Map(
    (profiles as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    authorName: names.get(r.user_id) ?? "Member",
    body: r.body,
    createdAt: r.created_at,
  }));
}

export type PostMessageResult = { ok: true } | { ok: false; status: number; reason: string };

export async function postThreadMessage(
  sessionDb: SupabaseClient,
  adminDb: SupabaseClient,
  userId: string,
  postId: string,
  body: string,
): Promise<PostMessageResult> {
  const post = await getPost(sessionDb, postId);
  if (!post) return { ok: false, status: 404, reason: "This post is no longer open." };
  if (!post.joined) return { ok: false, status: 403, reason: "Join first to chat with the group." };

  const verdict = await moderatePublicText(body);
  if (!verdict.allowed) return { ok: false, status: 422, reason: verdict.reason };

  const { error } = await adminDb
    .from("thread_messages")
    .insert({ post_id: postId, user_id: userId, body });
  if (error) throw new Error(`postThreadMessage: ${error.message}`);
  return { ok: true };
}
