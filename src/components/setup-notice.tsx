export function SetupNotice() {
  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <h1 className="font-serif text-2xl font-semibold">Almost there</h1>
      <p className="mt-2 text-muted">
        The app is running, but it is not connected to a database yet. To finish setup:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        <li>Create a Supabase project and run the SQL in supabase/migrations/0001_init.sql.</li>
        <li>Copy .env.example to .env.local and fill in the Supabase and Anthropic keys.</li>
        <li>Run the seed script to load the sample activities, then restart the dev server.</li>
      </ol>
      <p className="mt-4 text-sm text-muted">README.md has the exact commands.</p>
    </div>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <p role="status" className="py-10 text-center text-muted">
      {label}
    </p>
  );
}
