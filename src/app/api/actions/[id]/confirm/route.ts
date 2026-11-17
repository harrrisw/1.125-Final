import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { confirmAndExecute } from "@/lib/gate/execute";

/**
 * The confirm gate. Reached only when a signed-in person taps Confirm on a
 * card. This endpoint, the user-initiated join endpoint and the cron jobs are
 * the only places the admin client is created.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/actions/[id]/confirm">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ ok: false, reason: "Unknown draft." }, { status: 400 });
  }

  const result = await confirmAndExecute(session.db, createAdminClient(), session.user.id, id);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
