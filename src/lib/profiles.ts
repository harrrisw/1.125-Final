import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { moderatePublicText } from "@/lib/safety/moderation";

/**
 * Profiles other members can see. Everything on a profile is something the
 * person typed or chose for it; private memory is only ever offered to them
 * as a suggestion to add. Profile text is public, so it is moderated and then
 * written by the server (supabase/migrations/0003_social.sql removes the
 * client's own update policy).
 */

/** A shared mood stays on the profile for this long, then fades like the private one. */
export const PROFILE_MOOD_HOURS = 12;
export const MAX_LIST_ITEMS = 12;

export interface Profile {
  id: string;
  displayName: string;
  bio: string | null;
  homeArea: string | null;
  hobbies: string[];
  preferences: string[];
  /** Null when none is shared or the shared one has faded. */
  mood: string | null;
  moodExpiresAt: string | null;
  createdAt: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  bio: string | null;
  home_area: string | null;
  hobbies: string[] | null;
  preferences: string[] | null;
  mood: string | null;
  mood_expires_at: string | null;
  created_at: string;
}

const COLUMNS = "id, display_name, bio, home_area, hobbies, preferences, mood, mood_expires_at, created_at";

export function liveMood(mood: string | null, expiresAt: string | null, now = new Date()): string | null {
  if (!mood || !expiresAt) return null;
  return new Date(expiresAt) > now ? mood : null;
}

function fromRow(row: ProfileRow, now = new Date()): Profile {
  const mood = liveMood(row.mood, row.mood_expires_at, now);
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    homeArea: row.home_area,
    hobbies: row.hobbies ?? [],
    preferences: row.preferences ?? [],
    mood,
    moodExpiresAt: mood ? row.mood_expires_at : null,
    createdAt: row.created_at,
  };
}

/** Thrown when supabase/migrations/0003_social.sql has not been run yet. */
export class SocialNotSetUpError extends Error {
  constructor() {
    super("Profiles and messages are not set up yet. Run supabase/migrations/0003_social.sql in Supabase.");
    this.name = "SocialNotSetUpError";
  }
}

/** Missing column, table, view or function: the migration has not been run. */
export function isNotSetUp(error: { code?: string; message?: string }): boolean {
  return ["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "");
}

export async function getProfile(db: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await db.from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (isNotSetUp(error)) throw new SocialNotSetUpError();
    throw new Error(`getProfile: ${error.message}`);
  }
  return data ? fromRow(data as ProfileRow) : null;
}

/** Whether either person has blocked the other. */
export async function isBlockedBetween(db: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data, error } = await db.rpc("is_blocked_between", { p_a: a, p_b: b });
  if (error) throw new Error(`isBlockedBetween: ${error.message}`);
  return data === true;
}

/** Whether I have blocked them (as opposed to them blocking me). */
export async function haveBlocked(db: SupabaseClient, me: string, them: string): Promise<boolean> {
  const { data, error } = await db
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", me)
    .eq("blocked_id", them)
    .maybeSingle();
  if (error) throw new Error(`haveBlocked: ${error.message}`);
  return data !== null;
}

export async function block(db: SupabaseClient, me: string, them: string): Promise<void> {
  const { error } = await db.from("blocks").upsert({ blocker_id: me, blocked_id: them }, { ignoreDuplicates: true });
  if (error) throw new Error(`block: ${error.message}`);
}

export async function unblock(db: SupabaseClient, me: string, them: string): Promise<void> {
  const { error } = await db.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", them);
  if (error) throw new Error(`unblock: ${error.message}`);
}

export const ReportSchema = z.object({
  reason: z.string().trim().min(1, "Say briefly what happened.").max(1000),
  dm_message_id: z.uuid().optional(),
});

export async function report(
  db: SupabaseClient,
  me: string,
  them: string,
  input: z.infer<typeof ReportSchema>,
): Promise<void> {
  const { error } = await db.from("reports").insert({
    reporter_id: me,
    reported_user_id: them,
    reason: input.reason,
    dm_message_id: input.dm_message_id ?? null,
  });
  if (error) throw new Error(`report: ${error.message}`);
}

const listItem = z.string().trim().min(1).max(40);

/** Trims, drops empties and case-insensitive repeats, keeps the person's order. */
export function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim().replace(/\s+/g, " ");
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const ProfileInputSchema = z.object({
  display_name: z.string().trim().min(1, "Add a name people will see.").max(40),
  bio: z.string().trim().max(280).default(""),
  home_area: z.string().trim().max(60).default(""),
  hobbies: z.array(listItem).max(MAX_LIST_ITEMS).default([]),
  preferences: z.array(listItem).max(MAX_LIST_ITEMS).default([]),
  /** Empty clears the shared mood. */
  mood: z.string().trim().max(80).default(""),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

/** Every piece of text the profile would show, for one moderation check. */
export function publicTextOfProfile(input: ProfileInput): string {
  return [
    `Name: ${input.display_name}`,
    input.bio && `Bio: ${input.bio}`,
    input.home_area && `Area: ${input.home_area}`,
    input.hobbies.length > 0 && `Hobbies: ${input.hobbies.join(", ")}`,
    input.preferences.length > 0 && `Preferences: ${input.preferences.join(", ")}`,
    input.mood && `Current mood: ${input.mood}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type SaveProfileResult = { ok: true; profile: Profile } | { ok: false; status: number; reason: string };

/**
 * Moderates what would become public, then writes it with the service role.
 * A newly shared mood stays up for PROFILE_MOOD_HOURS; saving the same mood
 * again does not extend it.
 */
export async function saveProfile(
  sessionDb: SupabaseClient,
  adminDb: SupabaseClient,
  userId: string,
  raw: unknown,
  now = new Date(),
): Promise<SaveProfileResult> {
  const parsed = ProfileInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 400, reason: issue?.message ?? "Check the profile fields." };
  }
  const input = {
    ...parsed.data,
    hobbies: cleanList(parsed.data.hobbies),
    preferences: cleanList(parsed.data.preferences),
  };

  const current = await getProfile(sessionDb, userId);
  if (!current) return { ok: false, status: 404, reason: "Your profile could not be found." };

  // Text that is already on the profile was checked when it was saved.
  const shownNow = publicTextOfProfile({
    display_name: current.displayName,
    bio: current.bio ?? "",
    home_area: current.homeArea ?? "",
    hobbies: current.hobbies,
    preferences: current.preferences,
    mood: current.mood ?? "",
  });
  const text = publicTextOfProfile(input);
  if (text !== shownNow) {
    const verdict = await moderatePublicText(text);
    if (!verdict.allowed) return { ok: false, status: 422, reason: verdict.reason };
  }

  const moodChanged = input.mood !== (current.mood ?? "");
  const moodFields = !input.mood
    ? { mood: null, mood_expires_at: null }
    : moodChanged
      ? { mood: input.mood, mood_expires_at: new Date(now.getTime() + PROFILE_MOOD_HOURS * 3_600_000).toISOString() }
      : {};

  const { data, error } = await adminDb
    .from("profiles")
    .update({
      display_name: input.display_name,
      bio: input.bio || null,
      home_area: input.home_area || null,
      hobbies: input.hobbies,
      preferences: input.preferences,
      ...moodFields,
      updated_at: now.toISOString(),
    })
    .eq("id", userId)
    .select(COLUMNS)
    .single();
  if (error) {
    if (isNotSetUp(error)) throw new SocialNotSetUpError();
    throw new Error(`saveProfile: ${error.message}`);
  }
  return { ok: true, profile: fromRow(data as ProfileRow, now) };
}
