"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ALREADY_REGISTERED, authErrorMessage, readCredentials } from "@/lib/auth-messages";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface AuthState {
  status: "idle" | "error" | "check-email";
  message: string;
}

const NOT_CONFIGURED: AuthState = { status: "error", message: "Supabase is not configured yet. See README.md." };

/** Email and password. On success the session cookie is set and the person lands in Chat. */
export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const input = readCredentials(formData);
  if (!input.ok) return { status: "error", message: input.message };

  const db = await createSessionClient();
  const { error } = await db.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) {
    if (!error.code || !["invalid_credentials", "email_not_confirmed"].includes(error.code)) {
      console.error("signInWithPassword failed", error.code, error.message);
    }
    return { status: "error", message: authErrorMessage(error.code, "Sign-in is not available right now. Try again shortly.") };
  }
  redirect("/chat");
}

/**
 * Creates an account with a password. School addresses only: checked here for
 * a friendly message, and enforced again by a database trigger on sign-up.
 *
 * Whether a confirmation email is needed first is the Supabase project's
 * "Confirm email" setting: when it is off, the person is signed in at once.
 */
export async function signUpWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const input = readCredentials(formData);
  if (!input.ok) return { status: "error", message: input.message };

  const db = await createSessionClient();
  const { data: allowed, error: checkError } = await db.rpc("is_allowed_email", { p_email: input.email });
  if (checkError) {
    console.error("is_allowed_email failed", checkError.message);
    return { status: "error", message: "Sign-up is not available right now. Try again shortly." };
  }
  if (!allowed) {
    return { status: "error", message: "During the pilot, Offhours is open to Boston-area school email addresses only." };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    console.error("signUp failed", error.code, error.message);
    return { status: "error", message: authErrorMessage(error.code, "We could not create the account. Try again in a minute.") };
  }
  if (data.session) redirect("/chat");
  // With confirmation on, Supabase answers an existing address with a user that has no identities.
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { status: "error", message: ALREADY_REGISTERED };
  return { status: "check-email", message: `Check ${input.email} for a link to confirm your account, then sign in.` };
}
