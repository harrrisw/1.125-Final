import { describe, expect, it } from "vitest";
import {
  applyHardFilters,
  haversineKm,
  resolveWindow,
  withinWindow,
} from "@/lib/matcher/filters";
import { applyRerank, fallbackPicks } from "@/lib/matcher/rerank";
import { moodFit, rank, scoreCandidate, socialFit } from "@/lib/matcher/score";
import type { Candidate, CurrentState } from "@/lib/types";

const NOW = new Date("2026-11-21T18:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function candidate(overrides: Partial<Candidate> & { id: string }): Candidate {
  return {
    kind: "activity",
    title: overrides.id,
    description: null,
    category: null,
    tags: [],
    venueName: null,
    area: "Cambridge",
    lat: 42.37,
    lng: -71.11,
    startsAt: null,
    durationMinutes: 90,
    energy: 3,
    noise: 3,
    groupFit: ["solo", "small_group", "open"],
    url: null,
    interestSim: 0.5,
    dislikeSim: 0,
    ...overrides,
  };
}

function state(overrides: Partial<CurrentState> = {}): CurrentState {
  return {
    mood: [],
    energy: null,
    social: null,
    timeBudgetMinutes: null,
    expiresAt: hoursFromNow(6),
    ...overrides,
  };
}

const gallery = candidate({ id: "gallery", energy: 2, noise: 1, durationMinutes: 90 });
const trivia = candidate({ id: "trivia", energy: 4, noise: 4, durationMinutes: 150 });

describe("moodFit", () => {
  it("prefers quiet, low-energy options for a tired user", () => {
    const tired = state({ mood: ["tired", "calm"], energy: 2, timeBudgetMinutes: 120 });
    expect(moodFit(tired, gallery)).toBeGreaterThan(moodFit(tired, trivia));
  });

  it("prefers lively options for an adventurous user", () => {
    const lively = state({ mood: ["adventurous"], energy: 4 });
    expect(moodFit(lively, trivia)).toBeGreaterThan(moodFit(lively, gallery));
  });

  it("penalises options longer than the time the user has", () => {
    const short = state({ timeBudgetMinutes: 60 });
    const quick = candidate({ id: "quick", durationMinutes: 45 });
    const long = candidate({ id: "long", durationMinutes: 180 });
    expect(moodFit(short, quick)).toBe(1);
    expect(moodFit(short, long)).toBe(0);
  });

  it("is neutral when nothing is known", () => {
    expect(moodFit(null, gallery)).toBe(0.5);
    expect(moodFit(state(), gallery)).toBe(0.5);
  });
});

describe("socialFit", () => {
  const plan = candidate({
    id: "plan",
    kind: "open_plan",
    groupFit: ["small_group", "open"],
    plan: { hostName: "Maya", goingCount: 4, capacity: 8 },
  });

  it("puts open plans first when the user wants company", () => {
    const wantsGroup = state({ social: "small_group" });
    expect(socialFit(wantsGroup, plan)).toBeGreaterThan(socialFit(wantsGroup, gallery));
  });

  it("pushes open plans down when the user wants to be alone", () => {
    const wantsSolo = state({ social: "solo" });
    expect(socialFit(wantsSolo, plan)).toBeLessThan(socialFit(wantsSolo, gallery));
  });
});

describe("rank", () => {
  it("lets mood overturn a small interest lead, which profile-only cannot do", () => {
    const tired = state({ mood: ["tired"], energy: 2, timeBudgetMinutes: 120 });
    const options = [
      { ...gallery, interestSim: 0.55 },
      { ...trivia, interestSim: 0.7 },
    ];
    expect(rank(options, tired, "mood_profile")[0].candidate.id).toBe("gallery");
    expect(rank(options, tired, "profile_only")[0].candidate.id).toBe("trivia");
  });

  it("applies the dislike penalty only above the similarity floor", () => {
    const mild = scoreCandidate({ ...gallery, dislikeSim: 0.3 }, null);
    const strong = scoreCandidate({ ...gallery, dislikeSim: 0.9 }, null);
    expect(mild.penalty).toBe(0);
    expect(strong.penalty).toBeGreaterThan(0);
    expect(strong.total).toBeLessThan(mild.total);
  });

  it("orders ties the same way every time", () => {
    const a = candidate({ id: "a" });
    const b = candidate({ id: "b" });
    expect(rank([b, a], null).map((s) => s.candidate.id)).toEqual(["a", "b"]);
    expect(rank([a, b], null).map((s) => s.candidate.id)).toEqual(["a", "b"]);
  });
});

describe("hard filters", () => {
  const window = { from: NOW, to: new Date(hoursFromNow(4)) };
  const opts = { window, center: { lat: 42.3601, lng: -71.0942 }, radiusKm: 12 };

  it("keeps undated places and events inside the window", () => {
    expect(withinWindow(candidate({ id: "place" }), window)).toBe(true);
    expect(withinWindow(candidate({ id: "soon", startsAt: hoursFromNow(2) }), window)).toBe(true);
    expect(withinWindow(candidate({ id: "tomorrow", startsAt: hoursFromNow(30) }), window)).toBe(false);
    expect(withinWindow(candidate({ id: "past", startsAt: hoursFromNow(-1) }), window)).toBe(false);
  });

  it("drops far-away options, full plans and out-of-window events", () => {
    const kept = applyHardFilters(
      [
        candidate({ id: "near" }),
        candidate({ id: "worcester", lat: 42.2626, lng: -71.8023 }),
        candidate({
          id: "full",
          kind: "open_plan",
          plan: { hostName: "Leo", goingCount: 10, capacity: 10 },
        }),
        candidate({
          id: "room",
          kind: "open_plan",
          plan: { hostName: "Leo", goingCount: 6, capacity: 10 },
        }),
        candidate({ id: "next-week", startsAt: hoursFromNow(200) }),
      ],
      opts,
    );
    expect(kept.map((c) => c.id)).toEqual(["near", "room"]);
  });

  it("measures distance sensibly", () => {
    const mit = { lat: 42.3601, lng: -71.0942 };
    const harvard = { lat: 42.377, lng: -71.1167 };
    const km = haversineKm(mit, harvard);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(3.5);
  });
});

describe("resolveWindow", () => {
  it("defaults to the next few hours, or longer when the user has more time", () => {
    const short = resolveWindow({}, NOW, null);
    expect(short.from).toEqual(NOW);
    expect(short.to.getTime() - NOW.getTime()).toBe(4 * 3_600_000);

    const long = resolveWindow({}, NOW, 360);
    expect(long.to.getTime() - NOW.getTime()).toBe(6 * 3_600_000);
  });

  it("never starts in the past, ends before it starts, or runs past two weeks", () => {
    const past = resolveWindow({ from: hoursFromNow(-5), to: hoursFromNow(-2) }, NOW, null);
    expect(past.from).toEqual(NOW);
    expect(past.to.getTime()).toBeGreaterThan(NOW.getTime());

    const huge = resolveWindow({ to: hoursFromNow(24 * 60) }, NOW, null);
    expect(huge.to.getTime() - NOW.getTime()).toBe(14 * 86_400_000);

    const garbage = resolveWindow({ from: "saturday", to: "later" }, NOW, null);
    expect(garbage.from).toEqual(NOW);
  });
});

describe("re-rank", () => {
  const pool = rank([gallery, trivia, candidate({ id: "walk" })], null);

  it("ignores ids the model made up and repeats", () => {
    const picks = applyRerank(
      pool,
      [
        { id: "invented", reason: "nope" },
        { id: "walk", reason: "You wanted air." },
        { id: "walk", reason: "again" },
        { id: "gallery", reason: "" },
      ],
      null,
      3,
    );
    expect(picks.map((p) => p.candidate.id)).toEqual(["walk", "gallery"]);
    expect(picks.map((p) => p.rank)).toEqual([1, 2]);
    expect(picks[0].reason).toBe("You wanted air.");
    expect(picks[1].reason.length).toBeGreaterThan(0);
  });

  it("falls back to the heuristic order when the model returns nothing usable", () => {
    const picks = applyRerank(pool, [{ id: "invented", reason: "nope" }], null, 2);
    expect(picks).toEqual(fallbackPicks(pool, null, 2));
    expect(picks).toHaveLength(2);
  });
});
