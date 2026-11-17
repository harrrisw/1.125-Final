import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { confirmAndExecute } from "@/lib/gate/execute";
import { proposeAction } from "@/lib/gate/propose";
import { logRecEvent } from "@/lib/telemetry";

/**
 * Joining straight from the board or a pick card. The person tapping Join is
 * the explicit opt-in, so the draft is created and confirmed in one request.
 * It still goes through the same gate as an agent-drafted join.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/posts/[id]/join">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id: postId } = await ctx.params;
  if (!z.uuid().safeParse(postId).success) {
    return Response.json({ ok: false, reason: "Unknown post." }, { status: 400 });
  }

  await logRecEvent(session.db, session.user.id, { event: "click", postId });

  const action = await proposeAction(session.db, {
    userId: session.user.id,
    type: "join_post",
    payload: { post_id: postId },
    proposedBy: "user",
  });
  const result = await confirmAndExecute(
    session.db,
    createAdminClient(),
    session.user.id,
    action.id,
  );
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
