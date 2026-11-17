"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
}

/**
 * Emails a one-time sign-in link. School addresses only: checked here for a
 * friendly message, and enforced again by a database trigger on sign-up.
 */
export async function requestSignInLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase is not configured yet. See README.md." };
  }

  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) {
    return { status: "error", message: "Enter your school email address." };
  }
  const email = parsed.data;

  const db = await createSessionClient();
  const { data: allowed, error: checkError } = await db.rpc("is_allowed_email", { p_email: email });
  if (checkError) {
    console.error("is_allowed_email failed", checkError.message);
    return { status: "error", message: "Sign-in is not available right now. Try again shortly." };
  }
  if (!allowed) {
    return {
      status: "error",
      message: "During the pilot, Offhours is open to Boston-area school email addresses only.",
    };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    console.error("signInWithOtp failed", error.message);
    return { status: "error", message: "We could not send the link. Try again in a minute." };
  }
  return { status: "sent", message: `Check ${email} for a sign-in link.` };
}
