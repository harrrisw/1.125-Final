import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { confirmMemory, deleteMemory, updateMemory } from "@/lib/memory/profile";

const Patch = z.union([
  z.object({ content: z.string().trim().min(1).max(500) }),
  z.object({ confirm: z.literal(true) }),
]);

/** Edit a memory, or mark it as right. Both feed the memory-accuracy metric. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/memory/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  if ("confirm" in parsed.data) {
    await confirmMemory(session.db, session.user.id, id);
    return Response.json({ ok: true });
  }

  const item = await updateMemory(session.db, session.user.id, id, parsed.data.content);
  if (!item) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true, item });
}

/** Delete a memory for real. Only the verdict (not the text) is kept for the metric. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/memory/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const deleted = await deleteMemory(session.db, session.user.id, id);
  return Response.json({ ok: deleted }, { status: deleted ? 200 : 404 });
}
