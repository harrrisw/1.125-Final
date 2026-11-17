import seedFile from "../../../data/seed-activities.json";
import { ActivityInputSchema, type ActivityInput, type ActivitySource } from "@/lib/integrations/sources";

/**
 * A small hand-written catalog so the matcher has something to rank before
 * any API key exists, and so the pilot board is never empty on day one.
 */
export function loadSeedActivities(): ActivityInput[] {
  return seedFile.activities.map((entry) => ActivityInputSchema.parse({ ...entry, source: "seed" }));
}

export const seedSource: ActivitySource = {
  name: "seed",
  enabled: () => true,
  fetch: async () => loadSeedActivities(),
};
