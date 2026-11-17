import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { postThreadMessage } from "@/lib/board";
import { createAdminClient } from "@/lib/db/admin";

const Body = z.object({ body: z.string().trim().min(1).max(1000) });

/** A member's message in a plan chat. Typed by the person, moderated, then stored. */
export async function POST(request: Request, ctx: RouteContext<"/api/posts/[id]/messages">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id: postId } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(postId).success || !parsed.success) {
    return Response.json({ ok: false, reason: "Write a message of 1 to 1000 characters." }, { status: 400 });
  }

  const result = await postThreadMessage(
    session.db,
    createAdminClient(),
    session.user.id,
    postId,
    parsed.data.body,
  );
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
