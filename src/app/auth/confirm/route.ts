import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/db/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Landing point for the emailed sign-in link. Handles both link styles
 * Supabase can send: ?code=... (PKCE) and ?token_hash=...&type=email.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const failure = NextResponse.redirect(new URL("/login?error=link", origin));
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

  return signedIn ? NextResponse.redirect(new URL("/chat", origin)) : failure;
}
