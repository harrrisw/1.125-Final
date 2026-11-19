import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AGENT_TOOL_NAMES, buildAgentTools } from "@/lib/agent/tools";
import {
  ACTION_STATUSES,
  canTransition,
  parsePayload,
  publicTextOf,
  summarize,
} from "@/lib/gate/actions";
import { calendarTemplateUrl } from "@/lib/integrations/calendar";
import { localCheck } from "@/lib/safety/moderation";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const POST_ID = "3f2b8c1e-5d4a-4b6f-9c0d-1a2b3c4d5e6f";

describe("action lifecycle", () => {
  it("only reaches 'executed' by way of 'confirmed'", () => {
    expect(canTransition("proposed", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "executed")).toBe(true);
    expect(canTransition("proposed", "executed")).toBe(false);

    const intoExecuted = ACTION_STATUSES.filter((from) => canTransition(from, "executed"));
    expect(intoExecuted).toEqual(["confirmed"]);
    const intoConfirmed = ACTION_STATUSES.filter((from) => canTransition(from, "confirmed"));
    expect(intoConfirmed).toEqual(["proposed"]);
  });

  it("treats finished states as final", () => {
    for (const done of ["executed", "cancelled", "failed", "expired"] as const) {
      expect(ACTION_STATUSES.some((to) => canTransition(done, to))).toBe(false);
    }
  });
});

describe("payloads", () => {
  it("requires a start time for plans and a body for posts", () => {
    expect(() => parsePayload("post_plan", { body: "Trivia night" })).toThrow();
    expect(() => parsePayload("post_mood", { body: "   " })).toThrow();
    expect(() => parsePayload("post_mood", { body: "x".repeat(501) })).toThrow();
    expect(() => parsePayload("join_post", { post_id: "not-a-uuid" })).toThrow();

    const plan = parsePayload("post_plan", {
      body: "  Trivia night  ",
      starts_at: "2026-11-21T20:00:00-05:00",
      capacity: 10,
    });
    expect(plan.body).toBe("Trivia night");
  });

  it("knows which text becomes public", () => {
    expect(publicTextOf("post_mood", { body: "Feeling adventurous" })).toBe("Feeling adventurous");
    expect(publicTextOf("join_post", { post_id: POST_ID })).toBeNull();
    expect(
      publicTextOf("calendar_add", {
        title: "Gallery",
        starts_at: "2026-11-21T14:00:00-05:00",
        ends_at: "2026-11-21T16:00:00-05:00",
      }),
    ).toBeNull();
  });

  it("describes each action in plain words for the confirm card", () => {
    expect(summarize("post_mood", { body: "hi" })).toMatch(/public board/);
    expect(summarize("join_post", { post_id: POST_ID })).toMatch(/Join/);
  });
});

/** Follows "@/..." and relative imports from a set of files and returns every file reached. */
function reachableFrom(entryFiles: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entryFiles];
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const next = resolve(file, match[1]);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("what the agent can reach", () => {
  const ctx = {
    db: {} as SupabaseClient,
    userId: "u",
    sourceMessageId: "m",
    memories: [],
    cards: [],
    now: new Date(),
  };

  it("has exactly the documented tools, and none that act", () => {
    const names = buildAgentTools(ctx).map((t) => t.name);
    expect(names).toEqual([...AGENT_TOOL_NAMES]);
    for (const name of names) {
      // save_ tools write only the user's own private rows (see the saved-plans
      // tests in tests/db/schema.test.ts); anything public goes through propose_.
      expect(name).toMatch(/^(find_|get_|propose_|save_)/);
      expect(name).not.toMatch(/confirm|execute|publish|approve/);
    }
  });

  it("cannot import the executor or the admin database client, even indirectly", () => {
    const agentDir = path.join(SRC, "lib", "agent");
    const entries = readdirSync(agentDir).map((f) => path.join(agentDir, f));
    const reached = [...reachableFrom(entries)].map((f) => path.relative(SRC, f).replace(/\\/g, "/"));

    expect(reached).toContain("lib/gate/propose.ts");
    expect(reached).not.toContain("lib/gate/execute.ts");
    expect(reached).not.toContain("lib/db/admin.ts");
    expect(reached).not.toContain("lib/db/server.ts");
  });
});

describe("calendar link", () => {
  it("builds a prefilled Google Calendar URL in UTC", () => {
    const url = new URL(
      calendarTemplateUrl({
        title: "Gallery + coffee",
        starts_at: "2026-11-21T14:00:00-05:00",
        ends_at: "2026-11-21T16:30:00-05:00",
        location: "Harvard Art Museums, Cambridge",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Gallery + coffee");
    expect(url.searchParams.get("dates")).toBe("20261121T190000Z/20261121T213000Z");
    expect(url.searchParams.get("location")).toBe("Harvard Art Museums, Cambridge");
  });
});

describe("local moderation rules", () => {
  it("rejects contact details before any model is asked", () => {
    expect(localCheck("text me at 617-555-0123")).toMatch(/phone/);
    expect(localCheck("reach me: jo@example.edu")).toMatch(/email/);
  });

  it("lets ordinary invitations through", () => {
    expect(localCheck("Pub trivia Fri 8:00 pm, Central Sq, 6 of 10 spots taken")).toBeNull();
    expect(localCheck("Gallery + coffee, Sat 2 pm, 2026")).toBeNull();
  });
});
