/**
 * Loads data/seed-activities.json into the activities table.
 *   npm run seed
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * With VOYAGE_API_KEY set, each activity is embedded for interest matching.
 */
import { createAdminClient } from "@/lib/db/admin";
import { embeddingsEnabled } from "@/lib/embeddings";
import { loadSeedActivities } from "@/lib/integrations/seed";
import { upsertActivities } from "@/lib/integrations/sources";

async function main() {
  const items = loadSeedActivities();
  const written = await upsertActivities(createAdminClient(), items);
  const how = embeddingsEnabled()
    ? "with embeddings"
    : "without embeddings (set VOYAGE_API_KEY and re-run to add them)";
  console.log(`Seeded ${written} activities ${how}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
