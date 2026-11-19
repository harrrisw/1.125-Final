"use client";

import { useActionState, useState } from "react";
import { signInWithPassword, signUpWithPassword, type AuthState } from "@/app/login/actions";
import { PASSWORD_MIN } from "@/lib/auth-messages";

const INITIAL: AuthState = { status: "idle", message: "" };
type Mode = "signin" | "signup";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signIn, signingIn] = useActionState(signInWithPassword, INITIAL);
  const [signUpState, signUp, signingUp] = useActionState(signUpWithPassword, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signingIn : signingUp;

  if (mode === "signup" && signUpState.status === "check-email") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <p>{signUpState.message}</p>
        <button type="button" onClick={() => setMode("signin")} className="self-start font-medium text-accent hover:underline">
          Go to sign in
        </button>
      </div>
    );
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${mode === value ? "bg-ink text-paper" : "hover:bg-sand"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Sign in or create an account" className="flex gap-1 rounded-full border border-line bg-card p-1">
        {tab("signin", "Sign in")}
        {tab("signup", "Create account")}
      </div>

      {/* key: switching tabs gives a fresh form, so a typed password does not carry over. */}
      <form key={mode} action={mode === "signin" ? signIn : signUp} className="flex flex-col gap-3">
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

        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
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

        {state.status === "error" && (
          <p role="alert" className="text-sm text-accent">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-6 py-3 font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (mode === "signin" ? "Signing in…" : "Creating your account…") : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
