import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { deleteSavedPlan, PlansNotSetUpError } from "@/lib/itineraries";

/** Delete one of your saved plans, with all its stops. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/itineraries/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const deleted = await deleteSavedPlan(session.db, session.user.id, id);
    return Response.json({ ok: deleted }, { status: deleted ? 200 : 404 });
  } catch (err) {
    if (err instanceof PlansNotSetUpError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
