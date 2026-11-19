import Link from "next/link";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/new-password-form";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";

/** Where the emailed "set a new password" link lands, already signed in by /auth/confirm. */
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <Link href="/" className="font-serif text-2xl font-semibold">
          Offhours
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-semibold">Set a new password</h1>
      </div>
      <Suspense fallback={<PageLoading label="Loading…" />}>
        <ResetBody />
      </Suspense>
    </main>
  );
}

async function ResetBody() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <p>This link has expired, was already used, or was opened in a different browser.</p>
        <Link href="/login?error=reset" className="self-start font-medium text-accent underline-offset-2 hover:underline">
          Ask for a new link
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        For <span className="font-medium text-ink">{session.user.email}</span>. You will use this password to sign in from now on.
      </p>
      <NewPasswordForm />
    </div>
  );
}
