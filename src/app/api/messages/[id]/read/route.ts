import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { markRead } from "@/lib/messages";

/** Mark a conversation read for the signed-in member. */
export async function POST(_request: Request, ctx: RouteContext<"/api/messages/[id]/read">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ ok: false }, { status: 404 });
  await markRead(session.db, id);
  return Response.json({ ok: true });
}
