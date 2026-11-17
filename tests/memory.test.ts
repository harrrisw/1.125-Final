import { describe, expect, it } from "vitest";
import { describeNow } from "@/lib/agent/prompt";
import { dedupeFacts, normalizeFact } from "@/lib/memory/profile";
import { isLive, mergeState, type StateSignal } from "@/lib/memory/state";
import type { CurrentState } from "@/lib/types";
import { normalizeExtraction } from "@/lib/understand/schema";

const NOW = new Date("2026-11-21T18:00:00Z");
const NOTHING: StateSignal = { mood: [], energy: null, social: null, timeBudgetMinutes: null };

const live: CurrentState = {
  mood: ["tired"],
  energy: 2,
  social: "small_group",
  timeBudgetMinutes: 120,
  expiresAt: "2026-11-21T20:00:00Z",
};

describe("current state", () => {
  it("fades: an expired state is not live", () => {
    expect(isLive(live, NOW)).toBe(true);
    expect(isLive(live, new Date("2026-11-21T20:00:01Z"))).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });

  it("keeps what it had, without extending it, when a message says nothing about mood", () => {
    expect(mergeState(live, NOTHING, NOW)).toEqual(live);
  });

  it("lets new values win field by field and restarts the clock", () => {
    const merged = mergeState(live, { ...NOTHING, mood: ["restless"], energy: 4 }, NOW, 6);
    expect(merged).toEqual({
      mood: ["restless"],
      energy: 4,
      social: "small_group",
      timeBudgetMinutes: 120,
      expiresAt: "2026-11-22T00:00:00.000Z",
    });
  });

  it("does not carry an expired state into a new one", () => {
    const stale = { ...live, expiresAt: "2026-11-21T10:00:00Z" };
    expect(mergeState(stale, NOTHING, NOW)).toBeNull();
    const merged = mergeState(stale, { ...NOTHING, mood: ["calm"] }, NOW);
    expect(merged?.social).toBeNull();
    expect(merged?.mood).toEqual(["calm"]);
  });
});

describe("long-term facts", () => {
  it("normalises text for comparison", () => {
    expect(normalizeFact("  Avoids   LOUD places. ")).toBe("avoids loud places");
  });

  it("skips facts already known and repeats within a batch", () => {
    const fresh = dedupeFacts(
      [
        { kind: "dislike", content: "Loud bars.", confidence: 0.8 },
        { kind: "like", content: "quiet cafes", confidence: 0.9 },
        { kind: "like", content: "Quiet cafes", confidence: 0.7 },
        { kind: "interest", content: "loud bars", confidence: 0.5 },
      ],
      [{ kind: "dislike", content: "loud bars" }],
    );
    expect(fresh.map((f) => `${f.kind}:${f.content}`)).toEqual([
      "like:quiet cafes",
      "interest:loud bars",
    ]);
  });
});

describe("normalizeExtraction", () => {
  it("clamps ranges and tidies text", () => {
    const out = normalizeExtraction({
      state: {
        mood: [" Tired ", "tired", "CALM", "quiet", "extra"],
        energy: 9,
        social: "small_group",
        time_budget_minutes: 100_000,
      },
      facts: [
        { kind: "dislike", content: "  loud places  ", confidence: 3 },
        { kind: "like", content: "   ", confidence: 0.5 },
      ],
    });
    expect(out.state).toEqual({
      mood: ["tired", "calm", "quiet"],
      energy: 5,
      social: "small_group",
      timeBudgetMinutes: 1440,
    });
    expect(out.facts).toEqual([{ kind: "dislike", content: "loud places", confidence: 1 }]);
  });

  it("treats missing or nonsense values as unknown", () => {
    const out = normalizeExtraction({
      state: { mood: [], energy: null, social: null, time_budget_minutes: -30 },
      facts: [],
    });
    expect(out.state).toEqual({ mood: [], energy: null, social: null, timeBudgetMinutes: null });
  });
});

describe("describeNow", () => {
  it("gives the agent local time with the right UTC offset", () => {
    const winter = describeNow(new Date("2026-11-21T18:05:00Z"), "America/New_York");
    expect(winter.iso).toBe("2026-11-21T13:05:00-05:00");
    expect(winter.human).toContain("Saturday");

    const summer = describeNow(new Date("2026-07-04T18:05:00Z"), "America/New_York");
    expect(summer.iso).toBe("2026-07-04T14:05:00-04:00");

    expect(describeNow(new Date("2026-07-04T18:05:00Z"), "UTC").iso).toBe("2026-07-04T18:05:00+00:00");
  });
});
