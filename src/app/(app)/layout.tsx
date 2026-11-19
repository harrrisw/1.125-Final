import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/chat", label: "Chat" },
  { href: "/board", label: "Board" },
  { href: "/planner", label: "Plans" },
  { href: "/memory", label: "Memory" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 sm:px-6">
      {/* On a phone the navigation drops to its own row instead of overflowing. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-5">
        <Link href="/" className="font-serif text-2xl font-semibold">
          Offhours
        </Link>
        <nav
          aria-label="Main"
          className="-mx-3 flex items-center gap-1 whitespace-nowrap text-sm font-medium sm:mx-0"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 hover:bg-sand">
              {item.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-full px-3 py-2 text-muted hover:bg-sand">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
