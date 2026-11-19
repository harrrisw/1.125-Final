import { describe, expect, it } from "vitest";
import { ALREADY_REGISTERED, authErrorMessage, PasswordSchema, readCredentials } from "@/lib/auth-messages";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("email and password sign-in", () => {
  it("normalizes the email and accepts a long enough password", () => {
    expect(readCredentials(form({ email: "  Sam@MIT.edu ", password: "correct horse" }))).toEqual({
      ok: true,
      email: "sam@mit.edu",
      password: "correct horse",
    });
  });

  it("says what is wrong in plain words", () => {
    expect(readCredentials(form({ email: "not-an-email", password: "longenough" }))).toEqual({
      ok: false,
      message: "Enter your school email address.",
    });
    expect(readCredentials(form({ email: "sam@mit.edu", password: "short" }))).toEqual({
      ok: false,
      message: "Use at least 8 characters.",
    });
    expect(PasswordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });

  it("explains Supabase's errors, and falls back for anything unknown", () => {
    expect(authErrorMessage("invalid_credentials", "x")).toBe("That email and password do not match.");
    expect(authErrorMessage("user_already_exists", "x")).toBe(ALREADY_REGISTERED);
    expect(authErrorMessage("email_not_confirmed", "x")).toMatch(/Confirm your email/);
    expect(authErrorMessage("something_new", "Try again shortly.")).toBe("Try again shortly.");
    expect(authErrorMessage(undefined, "Try again shortly.")).toBe("Try again shortly.");
  });
});
