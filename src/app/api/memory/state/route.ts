import { requireSession } from "@/lib/auth";
import { clearState } from "@/lib/memory/state";

/** Forget the current mood right now instead of waiting for it to fade. */
export async function DELETE() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  await clearState(session.db, session.user.id);
  return Response.json({ ok: true });
}
