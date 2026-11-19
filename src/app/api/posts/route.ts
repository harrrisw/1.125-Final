import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { confirmAndExecute } from "@/lib/gate/execute";
import { PostMoodPayload, PostPlanPayload } from "@/lib/gate/actions";
import { proposeAction } from "@/lib/gate/propose";

const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("post_mood"), payload: PostMoodPayload }),
  z.object({ type: z.literal("post_plan"), payload: PostPlanPayload }),
]);

const MAX_DAYS_AHEAD = 30;

/**
 * Posting a mood or plan straight from the board. The person wrote the text
 * and tapped Post on a form that shows exactly what goes public, so the draft
 * is created and confirmed in one request, through the same gate (and the same
 * moderation) as a draft from the companion.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.at(-1);
    const reason =
      field === "body"
        ? "Write 1 to 500 characters."
        : field === "starts_at"
          ? "Pick when the plan starts."
          : field === "capacity"
            ? "A group is 2 to 50 people."
            : "Check the post and try again.";
    return Response.json({ ok: false, reason }, { status: 400 });
  }

  if (parsed.data.type === "post_plan") {
    const startsAt = new Date(parsed.data.payload.starts_at).getTime();
    if (startsAt < Date.now() - 5 * 60_000) {
      return Response.json({ ok: false, reason: "That time has already passed." }, { status: 400 });
    }
    if (startsAt > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
      return Response.json({ ok: false, reason: `Plans can be up to ${MAX_DAYS_AHEAD} days ahead.` }, { status: 400 });
    }
  }

  const action = await proposeAction(session.db, {
    userId: session.user.id,
    type: parsed.data.type,
    payload: parsed.data.payload,
    proposedBy: "user",
  });
  const result = await confirmAndExecute(session.db, createAdminClient(), session.user.id, action.id);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
