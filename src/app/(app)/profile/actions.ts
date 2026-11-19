"use server";

import { authErrorMessage, PasswordSchema } from "@/lib/auth-messages";
import { getSession } from "@/lib/auth";

export interface PasswordState {
  status: "idle" | "saved" | "error";
  message: string;
}

/** Sets or changes the signed-in member's password. */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sign in again first." };

  const password = String(formData.get("password") ?? "");
  const checked = PasswordSchema.safeParse(password);
  if (!checked.success) return { status: "error", message: checked.error.issues[0]?.message ?? "Choose another password." };
  if (String(formData.get("confirm") ?? "") !== password) {
    return { status: "error", message: "The two passwords do not match." };
  }

  const { error } = await session.db.auth.updateUser({ password });
  if (error) {
    console.error("updateUser(password) failed", error.code, error.message);
    return { status: "error", message: authErrorMessage(error.code, "The password could not be changed. Try again shortly.") };
  }
  return { status: "saved", message: "Password saved. Use it next time you sign in." };
}
