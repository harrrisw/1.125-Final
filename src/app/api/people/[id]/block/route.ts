import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { block, unblock } from "@/lib/profiles";

async function target(ctx: RouteContext<"/api/people/[id]/block">, me: string): Promise<string | Response> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ ok: false, reason: "Unknown member." }, { status: 404 });
  if (id === me) return Response.json({ ok: false, reason: "You cannot block yourself." }, { status: 400 });
  return id;
}

/** Block a member: neither of you sees the other's posts, messages or plan-chat lines. */
export async function POST(_request: Request, ctx: RouteContext<"/api/people/[id]/block">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const them = await target(ctx, session.user.id);
  if (them instanceof Response) return them;
  await block(session.db, session.user.id, them);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/people/[id]/block">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const them = await target(ctx, session.user.id);
  if (them instanceof Response) return them;
  await unblock(session.db, session.user.id, them);
  return Response.json({ ok: true });
}
