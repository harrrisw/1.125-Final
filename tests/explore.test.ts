import { describe, expect, it } from "vitest";
import type { BoardPost } from "@/lib/board";
import { EXPLORE_MOODS, explore, filterBoard, matchesMood, moodById, postCandidate } from "@/lib/explore";
import type { Candidate } from "@/lib/types";
import { communityTime, localToday, parseDate, resolveWhen, zonedTime } from "@/lib/when";

const iso = (d: Date | undefined) => d?.toISOString();

describe("calendar windows in Boston time", () => {
  // Thursday Nov 19, 2026, 2:00 PM in Boston (EST, UTC-5).
  const now = new Date("2026-11-19T19:00:00Z");

  it("turns local wall-clock times into the right instants, across daylight saving", () => {
    expect(iso(zonedTime({ year: 2026, month: 11, day: 19 }, 0))).toBe("2026-11-19T05:00:00.000Z");
    expect(iso(zonedTime({ year: 2026, month: 7, day: 4 }, 17))).toBe("2026-07-04T21:00:00.000Z");
    // Clocks went back on Nov 1, 2026: that day's midnight was still EDT.
    expect(iso(zonedTime({ year: 2026, month: 11, day: 1 }, 0))).toBe("2026-11-01T04:00:00.000Z");
    expect(iso(zonedTime({ year: 2026, month: 11, day: 2 }, 0))).toBe("2026-11-02T05:00:00.000Z");
  });

  it("knows today, tonight and tomorrow", () => {
    expect(localToday(now)).toBe("2026-11-19");
    const today = resolveWhen("today", null, now)!;
    expect([iso(today.from), iso(today.to)]).toEqual(["2026-11-19T19:00:00.000Z", "2026-11-20T05:00:00.000Z"]);
    const tonight = resolveWhen("tonight", null, now)!;
    expect([iso(tonight.from), iso(tonight.to)]).toEqual(["2026-11-19T22:00:00.000Z", "2026-11-20T08:00:00.000Z"]);
    const tomorrow = resolveWhen("tomorrow", null, now)!;
    expect([iso(tomorrow.from), iso(tomorrow.to)]).toEqual(["2026-11-20T05:00:00.000Z", "2026-11-21T05:00:00.000Z"]);
  });

  it("finds this weekend from a weekday and from inside the weekend", () => {
    const weekend = resolveWhen("weekend", null, now)!;
    expect([iso(weekend.from), iso(weekend.to)]).toEqual(["2026-11-20T22:00:00.000Z", "2026-11-23T05:00:00.000Z"]);
    const sunday = new Date("2026-11-22T15:00:00Z");
    const fromSunday = resolveWhen("weekend", null, sunday)!;
    expect([iso(fromSunday.from), iso(fromSunday.to)]).toEqual([iso(sunday), "2026-11-23T05:00:00.000Z"]);
  });

  it("reads a picked date and time as Boston time, wherever the device is", () => {
    expect(iso(communityTime("2026-11-22T19:00") ?? undefined)).toBe("2026-11-23T00:00:00.000Z");
    expect(iso(communityTime("2026-07-04T21:30") ?? undefined)).toBe("2026-07-05T01:30:00.000Z");
    expect(communityTime("2026-11-22")).toBeNull();
    expect(communityTime("2026-11-22T25:00")).toBeNull();
  });

  it("takes a chosen date, and ignores dates that do not exist", () => {
    const day = resolveWhen("date", "2026-11-22", now)!;
    expect([iso(day.from), iso(day.to)]).toEqual(["2026-11-22T05:00:00.000Z", "2026-11-23T05:00:00.000Z"]);
    expect(day.label).toBe("Sunday, Nov 22");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(resolveWhen("date", "soon", now)).toBeNull();
    expect(resolveWhen("any", null, now)).toBeNull();
  });
});

function activity(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    kind: "activity",
    title: id,
    description: null,
    category: null,
    tags: [],
    venueName: null,
    area: "Cambridge",
    lat: null,
    lng: null,
    startsAt: null,
    durationMinutes: 90,
    energy: 3,
    noise: 3,
    groupFit: ["solo", "small_group"],
    url: null,
    interestSim: 0,
    dislikeSim: 0,
    ...overrides,
  };
}

function post(id: string, overrides: Partial<BoardPost> = {}): BoardPost {
  return {
    id,
    type: "plan",
    body: id,
    area: null,
    startsAt: null,
    capacity: null,
    activityId: null,
    authorId: "someone",
    authorName: "Sam",
    goingCount: 1,
    joined: false,
    createdAt: "2026-11-19T12:00:00Z",
    expiresAt: "2026-11-23T12:00:00Z",
    ...overrides,
  };
}

describe("explore", () => {
  const now = new Date("2026-11-19T19:00:00Z");
  const library = activity("library", { title: "Boston Public Library", tags: ["library", "quiet"], energy: 1, noise: 1 });
  const bowling = activity("bowling", { title: "Candlepin bowling", tags: ["bowling", "games"], energy: 4, noise: 4, groupFit: ["open"] });
  const fells = activity("fells", { title: "Skyline hike", category: "Outdoors", tags: ["hike", "nature"], energy: 4, noise: 1 });
  // Tonight: Thursday 8 PM and 7:30 PM in Boston.
  const concert = activity("concert", { title: "Folk night", tags: ["live music"], startsAt: "2026-11-20T01:00:00Z" });
  const trivia = post("Pub trivia, all welcome", { startsAt: "2026-11-20T00:30:00Z", area: "Central Square" });
  const moodPost = post("Feeling like a quiet walk by the river, anyone?", { type: "mood" });
  const posts = [trivia, moodPost].map((p) => ({ post: p, candidate: postCandidate(p, undefined) }));
  const all = [library, bowling, fells, concert];

  it("matches moods by attributes and by words", () => {
    const calm = moodById("calm")!;
    expect(matchesMood(library, calm)).toBe(true);
    expect(matchesMood(bowling, calm)).toBe(false);
    expect(matchesMood(posts[1].candidate, calm)).toBe(true);
    expect(matchesMood(posts[0].candidate, moodById("social")!)).toBe(true);
    expect(EXPLORE_MOODS.map((m) => m.id)).toContain("outdoors");
  });

  it("filters by mood and splits posts from places", () => {
    const active = explore(all, posts, { mood: moodById("active"), q: null, window: null }, null, now);
    expect(active.places.map((s) => s.candidate.id).sort()).toEqual(["bowling", "fells"]);
    expect(active.posts).toEqual([]);
  });

  it("keeps places on any day but only events and plans in the chosen window", () => {
    const tonight = resolveWhen("tonight", null, now);
    const result = explore(all, posts, { mood: null, q: null, window: tonight }, null, now);
    // The concert and the trivia plan are tonight; the mood post is about now, which is before tonight.
    expect(result.places.map((s) => s.candidate.id).sort()).toEqual(["bowling", "concert", "fells", "library"]);
    expect(result.posts.map((s) => s.candidate.id)).toEqual([trivia.id]);

    const tomorrow = resolveWhen("tomorrow", null, now);
    const later = explore(all, posts, { mood: null, q: null, window: tomorrow }, null, now);
    expect(later.places.map((s) => s.candidate.id)).not.toContain("concert");
    expect(later.posts).toEqual([]);
  });

  it("searches by keyword, and shows nothing rather than unrelated options when nothing matches", () => {
    const hits = explore(all, posts, { mood: null, q: "a hike", window: null }, null, now);
    expect(hits.places.map((s) => s.candidate.id)).toEqual(["fells"]);
    const none = explore(all, posts, { mood: null, q: "karaoke", window: null }, null, now);
    expect(none).toEqual({ posts: [], places: [], keywordMatched: false });
  });

  it("filters the board by type, keyword and date", () => {
    const board = [trivia, moodPost];
    expect(filterBoard(board, { type: "mood", q: null, window: null }, now).posts).toEqual([moodPost]);
    expect(filterBoard(board, { type: "all", q: "trivia", window: null }, now).posts).toEqual([trivia]);
    expect(filterBoard(board, { type: "all", q: "river walk", window: null }, now).posts).toEqual([moodPost]);
    const today = resolveWhen("today", null, now);
    expect(filterBoard(board, { type: "all", q: null, window: today }, now).posts).toEqual([trivia, moodPost]);
    // Tomorrow: the trivia plan is tonight, and a mood is about right now.
    const tomorrow = resolveWhen("tomorrow", null, now);
    expect(filterBoard(board, { type: "all", q: null, window: tomorrow }, now).posts).toEqual([]);
  });
});
