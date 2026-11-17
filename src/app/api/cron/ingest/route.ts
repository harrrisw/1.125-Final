import { rejectUnlessCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/db/admin";
import { placesSource } from "@/lib/integrations/places";
import { seedSource } from "@/lib/integrations/seed";
import { upsertActivities, type ActivitySource } from "@/lib/integrations/sources";
import { ticketmasterSource } from "@/lib/integrations/ticketmaster";

export const maxDuration = 300;

const SOURCES: ActivitySource[] = [seedSource, placesSource, ticketmasterSource];

/**
 * Scheduled job: refresh the activity catalog from every enabled source.
 * Call with "Authorization: Bearer $CRON_SECRET" (Vercel Cron does this).
 */
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  const adminDb = createAdminClient();
  const report: Record<string, number | string> = {};
  for (const source of SOURCES) {
    if (!source.enabled()) {
      report[source.name] = "skipped (no API key)";
      continue;
    }
    try {
      report[source.name] = await upsertActivities(adminDb, await source.fetch());
    } catch (err) {
      console.error(`ingest ${source.name} failed`, err);
      report[source.name] = "failed";
    }
  }
  return Response.json({ ok: true, report });
}
