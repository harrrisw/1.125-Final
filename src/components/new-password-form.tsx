"use client";

import { useActionState, useState } from "react";
import { setNewPassword, type AuthState } from "@/app/login/actions";
import { PASSWORD_MIN } from "@/lib/auth-messages";

const INITIAL: AuthState = { status: "idle", message: "" };

/** Shown after opening the emailed link: choose the password, then straight into the app. */
export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, INITIAL);
  const [show, setShow] = useState(false);
  const input = "rounded-xl border border-line bg-card px-4 py-3";

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="new-password" className="text-sm font-medium">
        New password
      </label>
      <div className="flex gap-2">
        <input
          id="new-password"
          name="password"
          type={show ? "text" : "password"}
          required
          minLength={PASSWORD_MIN}
          maxLength={72}
          autoComplete="new-password"
          className={`min-w-0 flex-1 ${input}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className="rounded-xl border border-line px-3 text-sm text-muted hover:bg-sand"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <label htmlFor="confirm-password" className="text-sm font-medium">
        Type it again
      </label>
      <input
        id="confirm-password"
        name="confirm"
        type={show ? "text" : "password"}
        required
        minLength={PASSWORD_MIN}
        maxLength={72}
        autoComplete="new-password"
        className={input}
      />
      <p className="-mt-1 text-xs text-muted">At least {PASSWORD_MIN} characters.</p>
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
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
