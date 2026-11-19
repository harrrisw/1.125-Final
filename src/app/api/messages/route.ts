import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { sendDirectMessage } from "@/lib/messages";
import { SocialNotSetUpError } from "@/lib/profiles";

const Body = z.object({
  to: z.uuid(),
  body: z.string().trim().min(1).max(1000),
});

/** Send a direct message, typed by the sender. Moderated, then stored by the server. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "Write a message of 1 to 1000 characters." }, { status: 400 });
  }

  try {
    const result = await sendDirectMessage(createAdminClient(), session.user.id, parsed.data.to, parsed.data.body);
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch (err) {
    if (err instanceof SocialNotSetUpError) return Response.json({ ok: false, reason: err.message }, { status: 503 });
    throw err;
  }
}
