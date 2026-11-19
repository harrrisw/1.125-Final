"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { requestPasswordReset, signInWithPassword, signUpWithPassword, type AuthState } from "@/app/login/actions";
import { linkErrorMessage, PASSWORD_MIN } from "@/lib/auth-messages";

const INITIAL: AuthState = { status: "idle", message: "" };
type Mode = "signin" | "signup" | "reset";

export function LoginForm() {
  // An expired or reused emailed link comes back here with ?error=link or ?error=reset.
  const linkError = useSearchParams().get("error");
  const [mode, setMode] = useState<Mode>(linkError === "reset" ? "reset" : "signin");
  const [signInState, signIn, signingIn] = useActionState(signInWithPassword, INITIAL);
  const [signUpState, signUp, signingUp] = useActionState(signUpWithPassword, INITIAL);
  const [resetState, reset, resetting] = useActionState(requestPasswordReset, INITIAL);
  const [showPassword, setShowPassword] = useState(false);
  const [dismissedLinkError, setDismissedLinkError] = useState(false);

  const banner = !dismissedLinkError ? linkErrorMessage(linkError) : null;
  const go = (next: Mode) => {
    setMode(next);
    setDismissedLinkError(true);
  };

  const sent = (mode === "signup" && signUpState.status === "check-email") || (mode === "reset" && resetState.status === "check-email");
  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <p>{mode === "reset" ? resetState.message : signUpState.message}</p>
        <button type="button" onClick={() => go("signin")} className="self-start font-medium text-accent hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  const tab = (value: Exclude<Mode, "reset">, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => go(value)}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${mode === value ? "bg-ink text-paper" : "hover:bg-sand"}`}
    >
      {label}
    </button>
  );

  const emailField = (
    <>
      <label htmlFor="email" className="text-sm font-medium">
        School email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@school.edu"
        className="rounded-xl border border-line bg-card px-4 py-3"
      />
    </>
  );

  const errorLine = (state: AuthState) =>
    state.status === "error" && (
      <p role="alert" className="text-sm text-accent">
        {state.message}
      </p>
    );

  const submit = (pending: boolean, idle: string, busy: string) => (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-ink px-6 py-3 font-medium text-paper hover:opacity-90 disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );

  if (mode === "reset") {
    return (
      <div className="flex flex-col gap-4">
        {banner && (
          <p role="alert" className="rounded-xl bg-sand px-4 py-3 text-sm">
            {banner}
          </p>
        )}
        <div>
          <h2 className="font-serif text-xl font-semibold">Set a new password</h2>
          <p className="text-sm text-muted">
            We will email you a link. Open it in this browser and choose a password. This also works
            for accounts that never had one.
          </p>
        </div>
        <form action={reset} className="flex flex-col gap-3">
          {emailField}
          {errorLine(resetState)}
          {submit(resetting, "Email me a link", "Sending…")}
        </form>
        <button type="button" onClick={() => go("signin")} className="self-start text-sm font-medium text-accent hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signingIn : signingUp;

  return (
    <div className="flex flex-col gap-4">
      {banner && (
        <p role="alert" className="rounded-xl bg-sand px-4 py-3 text-sm">
          {banner}
        </p>
      )}
      <div role="tablist" aria-label="Sign in or create an account" className="flex gap-1 rounded-full border border-line bg-card p-1">
        {tab("signin", "Sign in")}
        {tab("signup", "Create account")}
      </div>

      {/* key: switching tabs gives a fresh form, so a typed password does not carry over. */}
      <form key={mode} action={mode === "signin" ? signIn : signUp} className="flex flex-col gap-3">
        {emailField}

        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          {mode === "signin" && (
            <button type="button" onClick={() => go("reset")} className="text-sm font-medium text-accent hover:underline">
              Forgot password?
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={PASSWORD_MIN}
            maxLength={72}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
            className="rounded-xl border border-line px-3 text-sm text-muted hover:bg-sand"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {mode === "signup" && <p className="-mt-1 text-xs text-muted">At least {PASSWORD_MIN} characters.</p>}

        {errorLine(state)}
        {mode === "signin"
          ? submit(pending, "Sign in", "Signing in…")
          : submit(pending, "Create account", "Creating your account…")}
      </form>
    </div>
  );
}
