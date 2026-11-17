import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MemoryList } from "@/components/memory-list";
import { PageLoading, SetupNotice } from "@/components/setup-notice";
import { getPageSession } from "@/lib/auth";
import { listMemory } from "@/lib/memory/profile";
import { loadState } from "@/lib/memory/state";

export default function MemoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">What Offhours remembers</h1>
        <p className="text-muted">
          Only you can see this. Edit anything that is wrong, or delete it: deleted means gone.
        </p>
      </div>
      <Suspense fallback={<PageLoading label="Loading your memory…" />}>
        <Memory />
      </Suspense>
    </div>
  );
}

async function Memory() {
  const session = await getPageSession();
  if (session.kind === "unconfigured") return <SetupNotice />;
  if (session.kind === "anonymous") redirect("/login");

  const [state, items] = await Promise.all([
    loadState(session.db, session.user.id),
    listMemory(session.db, session.user.id),
  ]);

  return <MemoryList state={state} items={items} />;
}
