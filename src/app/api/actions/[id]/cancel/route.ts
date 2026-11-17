import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { cancelAction } from "@/lib/gate/execute";

export async function POST(_request: Request, ctx: RouteContext<"/api/actions/[id]/cancel">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const ok = await cancelAction(session.db, id);
  return Response.json({ ok }, { status: ok ? 200 : 409 });
}
