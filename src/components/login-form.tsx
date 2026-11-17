"use client";

import { useActionState } from "react";
import { requestSignInLink, type LoginState } from "@/app/login/actions";

const INITIAL: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestSignInLink, INITIAL);

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-2xl border border-line bg-card p-5">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
