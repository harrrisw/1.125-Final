import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/auth-messages";

/**
 * Landing point for emailed links: confirming a new account, and setting a
 * new password (?next=/reset-password). Handles both link styles Supabase can
 * send: ?code=... (PKCE, which completes only in the browser that asked for
 * the email) and ?token_hash=...&type=....
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const reason = next === "/reset-password" ? "reset" : "link";
  const failure = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  if (!isSupabaseConfigured()) return failure;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const db = await createSessionClient();
  let signedIn = false;
  if (code) {
    signedIn = !(await db.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    signedIn = !(await db.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  return signedIn ? NextResponse.redirect(new URL(next, origin)) : failure;
}
