/**
 * Sets the password of an existing account, for accounts that were created
 * with an emailed sign-in link and so have no password yet.
 *
 *   npm run set-password
 *
 * Asks for the email, then the password twice. The password is typed here,
 * is not shown on screen, and is sent only to Supabase. Uses the service-role
 * key from .env.local, so run it only on your own machine.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PasswordSchema } from "../src/lib/auth-messages";

/** Reads one line; with `hidden`, nothing typed is echoed. */
function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding as BufferEncoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = (await ask("Account email: ")).trim().toLowerCase();
  const id = await findUserId(admin, email);
  if (!id) throw new Error(`No account uses ${email}. Create one on the sign-in page instead.`);

  const password = await ask("New password (not shown): ", true);
  const checked = PasswordSchema.safeParse(password);
  if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? "That password is not allowed.");
  if ((await ask("Type it again: ", true)) !== password) throw new Error("The two passwords did not match. Nothing was changed.");

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(`Supabase refused the password: ${error.message}`);
  console.log(`Password set for ${email}. Sign in at http://localhost:3000/login with it.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
