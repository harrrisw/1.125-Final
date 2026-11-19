import type { SupabaseClient } from "@supabase/supabase-js";
import { listBoard, type BoardPost } from "@/lib/board";
import type { TimeWindow } from "@/lib/matcher/filters";
import type { Candidate, Social } from "@/lib/types";

/**
 * Gathers everything the matcher could offer: catalog activities (places and
 * events) plus other people's open plans from the board.
 */

interface ActivityRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  venue_name: string | null;
  /** Missing until 0002_itineraries.sql has been run. */
  address?: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  duration_minutes: number | null;
  energy: number | null;
  noise: number | null;
  group_fit: Social[] | null;
  url: string | null;
  interest_sim: number | null;
  dislike_sim: number | null;
}

function activityToCandidate(row: ActivityRow): Candidate {
  return {
    id: row.id,
    kind: "activity",
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags ?? [],
    venueName: row.venue_name,
    address: row.address ?? null,
    area: row.area,
    lat: row.lat,
    lng: row.lng,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    energy: row.energy,
    noise: row.noise,
    groupFit: row.group_fit ?? [],
    url: row.url,
    interestSim: row.interest_sim ?? 0,
    dislikeSim: row.dislike_sim ?? 0,
  };
}

/** An open plan inherits venue and mood attributes from its activity when it has one. */
export function planToCandidate(post: BoardPost, base: Candidate | undefined): Candidate {
  return {
    id: post.id,
    kind: "open_plan",
    title: base?.title ?? post.body.slice(0, 80),
    description: post.body,
    category: base?.category ?? null,
    tags: base?.tags ?? [],
    venueName: base?.venueName ?? null,
    address: base?.address ?? null,
    area: post.area ?? base?.area ?? null,
    lat: base?.lat ?? null,
    lng: base?.lng ?? null,
    startsAt: post.startsAt,
    durationMinutes: base?.durationMinutes ?? null,
    energy: base?.energy ?? null,
    noise: base?.noise ?? null,
    groupFit: ["small_group", "open"],
    url: base?.url ?? null,
    interestSim: base?.interestSim ?? 0,
    dislikeSim: base?.dislikeSim ?? 0,
    plan: { hostName: post.authorName, goingCount: post.goingCount, capacity: post.capacity },
  };
}

/** Catalog places, and events starting in the window, scored against the caller's own memory. */
export async function loadActivities(db: SupabaseClient, window: TimeWindow): Promise<Candidate[]> {
  const { data, error } = await db.rpc("candidate_activities", {
    p_from: window.from.toISOString(),
    p_to: window.to.toISOString(),
    p_limit: 200,
  });
  if (error) throw new Error(`loadActivities: ${error.message}`);
  return (data as ActivityRow[]).map(activityToCandidate);
}

export async function loadCandidates(
  db: SupabaseClient,
  userId: string,
  window: TimeWindow,
): Promise<Candidate[]> {
  const [activities, board] = await Promise.all([loadActivities(db, window), listBoard(db, 100)]);
  const byId = new Map(activities.map((a) => [a.id, a]));

  const plans = board
    .filter((p) => p.type === "plan" && !p.joined && p.authorId !== userId)
    .map((p) => planToCandidate(p, p.activityId ? byId.get(p.activityId) : undefined));

  return [...activities, ...plans];
}
