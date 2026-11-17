import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <Link href="/" className="font-serif text-2xl font-semibold">
          Offhours
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-muted">
          Enter your school email and we will send you a one-time sign-in link. No password.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
