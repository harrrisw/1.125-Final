/**
 * Guard for scheduled-job endpoints. Returns a response to send back when the
 * caller is not allowed, or null when the job may run.
 *
 * With no CRON_SECRET configured the jobs are switched off entirely, so a
 * missing secret can never be matched by a request that also sends none.
 */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Scheduled jobs are off: CRON_SECRET is not set. See .env.example." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
