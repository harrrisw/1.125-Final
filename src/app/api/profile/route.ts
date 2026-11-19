import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { saveProfile, SocialNotSetUpError } from "@/lib/profiles";

/** Save your profile. Its text is public, so it is moderated before it is stored. */
export async function PUT(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    const result = await saveProfile(
      session.db,
      createAdminClient(),
      session.user.id,
      await request.json().catch(() => null),
    );
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return Response.json({ ok: false, reason: err.message }, { status: 503 });
    throw err;
  }
}
