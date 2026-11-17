import { rejectUnlessCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Scheduled job: retire moods and plans that have run out, and drafts nobody
 * confirmed. Reads already ignore expired rows; this keeps the tables tidy.
 * Call with "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  const adminDb = createAdminClient();
  const now = new Date().toISOString();

  const posts = await adminDb
    .from("posts")
    .update({ status: "expired" })
    .eq("status", "published")
    .lt("expires_at", now)
    .select("id");
  const drafts = await adminDb
    .from("pending_actions")
    .update({ status: "expired" })
    .eq("status", "proposed")
    .lt("expires_at", now)
    .select("id");

  if (posts.error || drafts.error) {
    console.error("expire failed", posts.error?.message, drafts.error?.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({
    ok: true,
    expiredPosts: posts.data.length,
    expiredDrafts: drafts.data.length,
  });
}
