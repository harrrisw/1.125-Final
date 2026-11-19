import { z } from "zod";

/**
 * Email-and-password sign-in: the shared rules and the wording of errors, kept
 * pure so the forms, the server actions and the tests agree.
 */

/** bcrypt, which Supabase uses, only reads the first 72 bytes. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const CredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter your school email address.")),
  password: PasswordSchema,
});

/** Turns a form submission into credentials, or the first problem in plain words. */
export function readCredentials(
  formData: FormData,
): { ok: true; email: string; password: string } | { ok: false; message: string } {
  const parsed = CredentialsSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your email and password." };
  return { ok: true, ...parsed.data };
}

/**
 * Where an emailed link may send someone after signing them in: a path on
 * this site only, never another site ("//evil.example" or a full URL).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/chat"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** What the sign-in page says when an emailed link did not work. */
export function linkErrorMessage(error: string | null | undefined): string | null {
  if (error === "reset") return "That password link has expired or was already used, or was opened in a different browser. Ask for a new one below.";
  if (error === "link") return "That link has expired or was already used, or was opened in a different browser. Sign in, or ask for a new link.";
  return null;
}

export const ALREADY_REGISTERED =
  "This email already has an account. Sign in with your password instead. If you only ever signed in with an emailed link, set a password first.";

/** Supabase Auth error codes, in words a person can act on. */
export function authErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "invalid_credentials":
      return "That email and password do not match.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent you, then sign in.";
    case "user_already_exists":
    case "email_exists":
      return ALREADY_REGISTERED;
    case "weak_password":
      return "Choose a stronger password: longer, and not a common one.";
    case "same_password":
      return "That is already your password.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts just now. Wait a minute and try again.";
    case "signup_disabled":
      return "New accounts are closed right now.";
    case "email_address_not_authorized":
      return "We could not send a confirmation email to that address. Ask the pilot team to switch off email confirmation, or try again later.";
    default:
      return fallback;
  }
}
