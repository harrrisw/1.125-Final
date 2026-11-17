import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface Session {
  db: SupabaseClient;
  user: SessionUser;
}

export type PageSession =
  | { kind: "unconfigured" }
  | { kind: "anonymous" }
  | ({ kind: "user" } & Session);

/** For pages: distinguishes "not set up yet" from "not signed in". */
export async function getPageSession(): Promise<PageSession> {
  // Always wait for a real request. Without this, a build made before the
  // environment is configured would prerender the setup notice into the page.
  await connection();
  if (!isSupabaseConfigured()) return { kind: "unconfigured" };
  const session = await getSession();
  return session ? { kind: "user", ...session } : { kind: "anonymous" };
}

/**
 * The signed-in user plus a database client that acts as them.
 * getUser() re-validates the token with Supabase rather than trusting the cookie.
 */
export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const db = await createSessionClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { db, user: { id: data.user.id, email: data.user.email ?? null } };
}

/** For route handlers: the session, or a ready-made 401/503 response. */
export async function requireSession(): Promise<Session | Response> {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured. See README.md for setup." },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  return session;
}
