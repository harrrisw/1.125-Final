"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ALREADY_REGISTERED, authErrorMessage, PasswordSchema, readCredentials } from "@/lib/auth-messages";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;
}

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

  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: `${await requestOrigin()}/auth/confirm` },
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

/**
 * Emails a link to set a new password. The answer is the same whether or not
 * an account uses the address, so the form cannot be used to find out who
 * has an account. The link opens /reset-password through /auth/confirm, and
 * must be opened in this browser (Supabase's PKCE flow keeps a code here).
 */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { status: "error", message: "Enter your school email address." };

  const db = await createSessionClient();
  const { error } = await db.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    console.error("resetPasswordForEmail failed", error.code, error.message);
    if (error.code === "over_email_send_rate_limit") {
      return {
        status: "error",
        message: "Too many emails have been sent in the last hour. Try again later.",
      };
    }
    return { status: "error", message: authErrorMessage(error.code, "We could not send the link. Try again in a minute.") };
  }
  return {
    status: "check-email",
    message: `If an account uses ${parsed.data}, we sent it a link to set a new password. Open it in this browser.`,
  };
}

/** Saves the new password chosen after opening the emailed link, then opens the app. */
export async function setNewPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const session = await getSession();
  if (!session) {
    return { status: "error", message: "This link has expired. Ask for a new one from the sign-in page." };
  }
  const password = String(formData.get("password") ?? "");
  const checked = PasswordSchema.safeParse(password);
  if (!checked.success) return { status: "error", message: checked.error.issues[0]?.message ?? "Choose another password." };
  if (String(formData.get("confirm") ?? "") !== password) {
    return { status: "error", message: "The two passwords do not match." };
  }

  const { error } = await session.db.auth.updateUser({ password });
  if (error) {
    console.error("updateUser(password) failed", error.code, error.message);
    return { status: "error", message: authErrorMessage(error.code, "The password could not be saved. Try again shortly.") };
  }
  redirect("/chat");
}
