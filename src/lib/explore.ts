import type { BoardPost } from "@/lib/board";
import { planToCandidate } from "@/lib/matcher/candidates";
import { applyTopic, topicScore } from "@/lib/matcher/focus";
import { rank, type ScoredCandidate } from "@/lib/matcher/score";
import type { Candidate, CurrentState } from "@/lib/types";
import { coversNow, startsWithin, type Window } from "@/lib/when";

/**
 * Explore: browse places, events and other people's posts by mood, keyword
 * and date, without going through the companion. Pure, so it is tested
 * directly; the page loads the data and renders the result.
 */

export interface ExploreMood {
  id: string;
  label: string;
  hint: string;
  /** Words in a title, category, tag or post that suggest this mood. */
  words: string[];
  /** Attributes that suggest it, when an option has them. */
  fits?: (c: Candidate) => boolean;
}

export const EXPLORE_MOODS: ExploreMood[] = [
  {
    id: "calm",
    label: "Calm",
    hint: "Quiet and low-key",
    words: ["quiet", "calm", "chill", "relaxed", "cozy", "peaceful", "library", "books", "cafe", "tea"],
    fits: (c) => c.energy !== null && c.noise !== null && c.energy <= 2 && c.noise <= 2,
  },
  {
    id: "curious",
    label: "Curious",
    hint: "Museums, history, ideas",
    words: ["museum", "art", "history", "library", "books", "film", "exhibit", "architecture", "exploring", "tour", "lecture"],
  },
  {
    id: "social",
    label: "Social",
    hint: "Meet people",
    words: ["group", "friends", "meet", "trivia", "games", "social", "everyone", "welcome", "join", "together"],
    fits: (c) => c.kind === "open_plan" || c.groupFit.includes("open"),
  },
  {
    id: "active",
    label: "Active",
    hint: "Get moving",
    // Not "walk": a quiet stroll is calm, not active.
    words: ["hike", "run", "bike", "climb", "bowling", "games", "adventure", "dance", "sports"],
    fits: (c) => c.energy !== null && c.energy >= 4,
  },
  {
    id: "outdoors",
    label: "Outdoors",
    hint: "Fresh air",
    words: ["outdoors", "outside", "park", "walk", "hike", "nature", "river", "pond", "garden", "sunset", "ocean"],
  },
  {
    id: "artsy",
    label: "Artsy",
    hint: "Art, film, music",
    words: ["art", "gallery", "film", "cinema", "music", "concert", "folk", "acoustic", "theatre", "creative"],
  },
  {
    id: "hungry",
    label: "Hungry",
    hint: "Food and coffee",
    words: ["food", "eat", "dinner", "lunch", "brunch", "cafe", "coffee", "snack", "market", "pizza"],
  },
];

export function moodById(id: string | null | undefined): ExploreMood | null {
  return EXPLORE_MOODS.find((m) => m.id === id) ?? null;
}

export function matchesMood(c: Candidate, mood: ExploreMood): boolean {
  return (mood.fits?.(c) ?? false) || topicScore(c, [mood.words]) > 0;
}

/**
 * A board post as something Explore can filter and rank. Its own words come
 * first, and it inherits the catalog attributes of the place it is at.
 */
export function postCandidate(post: BoardPost, base: Candidate | undefined): Candidate {
  const candidate = planToCandidate(post, base);
  return { ...candidate, title: [post.body, post.area, base?.title].filter(Boolean).join(" · ") };
}

/** Plans happen at a time; a shared mood is about right now. */
export function postInWindow(post: BoardPost, window: Window | null, now: Date): boolean {
  if (!window) return true;
  if (post.type === "plan") return startsWithin(post.startsAt, window);
  return coversNow(window, now);
}

/** Places are open any day; dated events must start in the window. */
export function activityInWindow(c: Candidate, window: Window | null): boolean {
  if (!window || c.startsAt === null) return true;
  return startsWithin(c.startsAt, window);
}

export interface ExploreQuery {
  mood: ExploreMood | null;
  q: string | null;
  window: Window | null;
}

export interface ExploreResult {
  posts: ScoredCandidate[];
  places: ScoredCandidate[];
  /** false when a keyword was given and nothing matched it. */
  keywordMatched: boolean | null;
}

/**
 * Filters by date, mood and keyword, then orders by how well each option suits
 * this person right now (their private mood and memory decide the order only;
 * nothing about them is shown).
 */
export function explore(
  activities: Candidate[],
  posts: { post: BoardPost; candidate: Candidate }[],
  query: ExploreQuery,
  state: CurrentState | null,
  now: Date,
): ExploreResult {
  const inTime = [
    ...activities.filter((c) => activityInWindow(c, query.window)),
    ...posts.filter((p) => postInWindow(p.post, query.window, now)).map((p) => p.candidate),
  ];
  const inMood = query.mood ? inTime.filter((c) => matchesMood(c, query.mood as ExploreMood)) : inTime;
  const ranked = rank(inMood, state);

  let items = ranked;
  let keywordMatched: boolean | null = null;
  if (query.q?.trim()) {
    const topic = applyTopic(ranked, query.q);
    keywordMatched = topic.matched;
    // Unlike the companion, Explore shows nothing rather than unrelated options.
    items = topic.matched === false ? [] : topic.items;
  }

  return {
    posts: items.filter((s) => s.candidate.kind === "open_plan"),
    places: items.filter((s) => s.candidate.kind === "activity"),
    keywordMatched,
  };
}

/** Keyword and date filters for the board itself. */
export function filterBoard(
  posts: BoardPost[],
  filter: { type: "all" | "plan" | "mood"; q: string | null; window: Window | null },
  now: Date,
): { posts: BoardPost[]; keywordMatched: boolean | null } {
  const byType = posts.filter((p) => filter.type === "all" || p.type === filter.type);
  const byTime = byType.filter((p) => postInWindow(p, filter.window, now));
  if (!filter.q?.trim()) return { posts: byTime, keywordMatched: null };

  const scored = byTime.map((post) => ({ post, candidate: postCandidate(post, undefined) }));
  const topic = applyTopic(scored, filter.q);
  return {
    posts: topic.matched === false ? [] : topic.items.map((s) => s.post),
    keywordMatched: topic.matched,
  };
}
