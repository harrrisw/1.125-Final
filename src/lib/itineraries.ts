import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PlanStop, SavedPlan } from "@/lib/types";

/**
 * Saved plans: private itineraries the user kept from a conversation, each an
 * ordered list of stops. Everything here runs through the user's own session,
 * so row-level security keeps a plan visible to its owner only.
 */

export const MAX_STOPS = 8;

export const SavePlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
  stops: z
    .array(
      z.object({
        activity_id: z.uuid(),
        note: z.string().trim().max(300).optional(),
        starts_at: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(MAX_STOPS),
  replace_plan_id: z.uuid().optional(),
});
export type SavePlanInput = z.infer<typeof SavePlanSchema>;

/** Thrown when supabase/migrations/0002_itineraries.sql has not been run yet. */
export class PlansNotSetUpError extends Error {
  constructor() {
    super("Saved plans are not set up yet. Run supabase/migrations/0002_itineraries.sql in Supabase.");
    this.name = "PlansNotSetUpError";
  }
}

// PostgREST: table or function missing from the schema; Postgres: undefined table or function.
const MISSING = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

function fail(where: string, error: { code?: string; message: string }): never {
  if (error.code && MISSING.has(error.code)) throw new PlansNotSetUpError();
  throw new Error(`${where}: ${error.message}`);
}

interface StopRow {
  id: string;
  seq: number;
  activity_id: string | null;
  title: string;
  venue_name: string | null;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  note: string | null;
  starts_at: string | null;
}

interface PlanRow {
  id: string;
  title: string;
  note: string | null;
  created_at: string;
  itinerary_stops: StopRow[] | null;
}

const SELECT =
  "id, title, note, created_at, itinerary_stops (id, seq, activity_id, title, venue_name, address, area, lat, lng, url, note, starts_at)";

export function toSavedPlan(row: PlanRow): SavedPlan {
  const stops: PlanStop[] = [...(row.itinerary_stops ?? [])]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({
      id: s.id,
      activityId: s.activity_id,
      title: s.title,
      venueName: s.venue_name,
      address: s.address,
      area: s.area,
      lat: s.lat,
      lng: s.lng,
      url: s.url,
      note: s.note,
      startsAt: s.starts_at,
    }));
  return { id: row.id, title: row.title, note: row.note, createdAt: row.created_at, stops };
}

export async function listSavedPlans(db: SupabaseClient, userId: string, limit = 50): Promise<SavedPlan[]> {
  const { data, error } = await db
    .from("itineraries")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listSavedPlans", error);
  return (data as unknown as PlanRow[]).map(toSavedPlan);
}

export async function getSavedPlan(db: SupabaseClient, userId: string, id: string): Promise<SavedPlan | null> {
  const { data, error } = await db
    .from("itineraries")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("getSavedPlan", error);
  return data ? toSavedPlan(data as unknown as PlanRow) : null;
}

/**
 * Saves a plan with its stops in one database call. The database copies each
 * stop's venue details from the catalog and refuses a stop it does not know.
 */
export async function savePlan(
  db: SupabaseClient,
  userId: string,
  input: SavePlanInput,
  sourceMessageId: string | null,
): Promise<SavedPlan> {
  const parsed = SavePlanSchema.parse(input);
  const { data, error } = await db.rpc("save_itinerary", {
    p_title: parsed.title,
    p_note: parsed.note ?? null,
    p_stops: parsed.stops,
    p_source_message_id: sourceMessageId,
    p_replace_id: parsed.replace_plan_id ?? null,
  });
  if (error) fail("savePlan", error);
  const plan = await getSavedPlan(db, userId, data as string);
  if (!plan) throw new Error("savePlan: the plan was saved but could not be read back");
  return plan;
}

export async function deleteSavedPlan(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await db.from("itineraries").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("deleteSavedPlan", error);
  return (data ?? []).length > 0;
}

/**
 * Takes one stop out of a plan. A plan with no stops left is removed too.
 * Returns what happened so the page knows where to go next.
 */
export async function removeStop(
  db: SupabaseClient,
  userId: string,
  planId: string,
  stopId: string,
): Promise<"removed" | "plan_deleted" | "not_found"> {
  const { data, error } = await db
    .from("itinerary_stops")
    .delete()
    .eq("user_id", userId)
    .eq("itinerary_id", planId)
    .eq("id", stopId)
    .select("id");
  if (error) fail("removeStop", error);
  if ((data ?? []).length === 0) return "not_found";

  const { count, error: countError } = await db
    .from("itinerary_stops")
    .select("id", { count: "exact", head: true })
    .eq("itinerary_id", planId);
  if (countError) fail("removeStop", countError);
  if ((count ?? 0) > 0) return "removed";

  await deleteSavedPlan(db, userId, planId);
  return "plan_deleted";
}
