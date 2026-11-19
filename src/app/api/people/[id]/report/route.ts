import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { report, ReportSchema } from "@/lib/profiles";

/** Report a member to the people running the pilot. Only the reporter can see the report. */
export async function POST(request: Request, ctx: RouteContext<"/api/people/[id]/report">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success || id === session.user.id) {
    return Response.json({ ok: false, reason: "Unknown member." }, { status: 404 });
  }
  const parsed = ReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Say briefly what happened." }, { status: 400 });
  }
  await report(session.db, session.user.id, id, parsed.data);
  return Response.json({ ok: true });
}
