/** Shown until supabase/migrations/0003_social.sql has been run. */
export function SocialNotSetUp() {
  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <p className="font-medium">Profiles and messages need one more database step.</p>
      <p className="text-sm text-muted">
        In Supabase, open the SQL editor and run the contents of supabase/migrations/0003_social.sql,
        then reload this page.
      </p>
    </div>
  );
}
