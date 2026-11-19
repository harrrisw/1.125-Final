import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { PlansNotSetUpError, removeStop } from "@/lib/itineraries";

/** Take one stop out of a saved plan. Removing the last stop removes the plan. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/itineraries/[id]/stops/[stopId]">,
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id, stopId } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(stopId).success) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const result = await removeStop(session.db, session.user.id, id, stopId);
    if (result === "not_found") return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ ok: true, result });
  } catch (err) {
    if (err instanceof PlansNotSetUpError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
