import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { embed, toVectorLiteral } from "@/lib/embeddings";
import { SOCIAL_VALUES } from "@/lib/types";

/**
 * Activity ingestion. Every source (seed file, Google Places, Ticketmaster)
 * produces the same ActivityInput shape, so the matcher never knows or cares
 * where an option came from.
 */

export const ActivityInputSchema = z.object({
  source: z.enum(["seed", "places", "ticketmaster"]),
  externalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  venueName: z.string().optional(),
  address: z.string().optional(),
  area: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isPublicVenue: z.boolean().default(true),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  /** 1 = restful, 5 = intense. */
  energy: z.number().int().min(1).max(5).optional(),
  /** 1 = hushed, 5 = loud. */
  noise: z.number().int().min(1).max(5).optional(),
  groupFit: z.array(z.enum(SOCIAL_VALUES)).default(["solo", "small_group", "open"]),
  priceLevel: z.number().int().min(0).max(4).optional(),
  url: z.string().optional(),
});

export type ActivityInput = z.infer<typeof ActivityInputSchema>;

export interface ActivitySource {
  name: string;
  /** False when the source's API key is missing, so ingest skips it quietly. */
  enabled(): boolean;
  fetch(): Promise<ActivityInput[]>;
}

/** The text an activity is embedded as, for interest matching. */
export function embeddingText(a: ActivityInput): string {
  return [a.title, a.description, a.category, a.tags.join(", "), a.area]
    .filter((part) => part && part.length > 0)
    .join(". ");
}

const EMBED_BATCH = 64;

/** Inserts or refreshes activities, keyed on (source, external_id). Service role only. */
export async function upsertActivities(
  adminDb: SupabaseClient,
  items: ActivityInput[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < items.length; i += EMBED_BATCH) {
    const batch = items.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch.map(embeddingText), "document");

    const { error } = await adminDb.from("activities").upsert(
      batch.map((a, j) => ({
        source: a.source,
        external_id: a.externalId,
        title: a.title,
        description: a.description ?? null,
        category: a.category ?? null,
        tags: a.tags,
        venue_name: a.venueName ?? null,
        address: a.address ?? null,
        area: a.area ?? null,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        is_public_venue: a.isPublicVenue,
        starts_at: a.startsAt ?? null,
        ends_at: a.endsAt ?? null,
        duration_minutes: a.durationMinutes ?? null,
        energy: a.energy ?? null,
        noise: a.noise ?? null,
        group_fit: a.groupFit,
        price_level: a.priceLevel ?? null,
        url: a.url ?? null,
        fetched_at: new Date().toISOString(),
        ...(vectors ? { embedding: toVectorLiteral(vectors[j]) } : {}),
      })),
      { onConflict: "source,external_id" },
    );
    if (error) throw new Error(`upsertActivities: ${error.message}`);
    written += batch.length;
  }
  return written;
}
