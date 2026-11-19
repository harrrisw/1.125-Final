"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/(app)/profile/actions";
import { PASSWORD_MIN } from "@/lib/auth-messages";

const INITIAL: PasswordState = { status: "idle", message: "" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  const input = "rounded-xl border border-line bg-paper px-3 py-2";

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          New password
          <input name="password" type="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Type it again
          <input name="confirm" type="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" className={input} />
        </label>
      </div>
      {state.status !== "idle" && (
        <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-accent" : "text-muted"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full border border-ink px-5 py-2 text-sm font-medium hover:bg-sand disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
