import type { Candidate } from "@/lib/types";

/**
 * Narrows a search to what the user asked for this time: a kind of thing
 * ("art", "a film", "a walk") and a place to stay near ("Cambridge"). The
 * agent passes these per search, so one outing with several stops can be
 * built from several focused searches.
 *
 * Both are soft: when nothing matches, the full list is kept and the caller
 * is told, so the agent can say so instead of passing off an unrelated pick
 * as what was asked for.
 */

export interface Focus {
  lookingFor?: string | null;
  near?: string | null;
}

export interface Focused<T> {
  items: T[];
  /** null when no filter was asked for; false when nothing matched and the list was kept. */
  matched: boolean | null;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Keeps candidates whose area, address, venue or title names the place. */
export function applyNear<T extends Candidate>(candidates: T[], near?: string | null): Focused<T> {
  const place = near ? normalize(near) : "";
  if (!place) return { items: candidates, matched: null };
  const items = candidates.filter((c) =>
    [c.area, c.address, c.venueName, c.title].some((field) => field && ` ${normalize(field)} `.includes(` ${place} `)),
  );
  return items.length > 0 ? { items, matched: true } : { items: candidates, matched: false };
}

const STOPWORDS = new Set([
  "and", "the", "for", "with", "something", "some", "somewhere", "thing", "things", "place", "places",
  "spot", "maybe", "kind", "sort", "good", "nice", "fun", "near", "around", "then", "after", "before",
  "stop", "afternoon", "evening", "night", "morning", "tonight", "today", "weekend", "sunday",
  "saturday", "time", "bit", "little", "quick", "short", "long", "visit", "see", "get", "grab", "go",
]);

/** Everyday words mapped onto the catalog's own vocabulary (categories and tags). */
const SYNONYMS: Record<string, string[]> = {
  artsy: ["art"],
  arts: ["art"],
  artistic: ["art"],
  gallery: ["art", "galleries"],
  exhibit: ["art", "museum"],
  exhibition: ["art", "museum"],
  movie: ["film", "cinema"],
  movies: ["film", "cinema"],
  screening: ["film", "cinema"],
  cinema: ["film"],
  concert: ["music"],
  gig: ["music"],
  band: ["music"],
  stroll: ["walk"],
  wander: ["walk"],
  ramble: ["walk"],
  hike: ["hike", "walk"],
  hiking: ["hike", "walk"],
  coffee: ["cafe", "coffee"],
  tea: ["cafe"],
  eat: ["food"],
  dinner: ["food"],
  lunch: ["food"],
  snack: ["food"],
  bookstore: ["books"],
  bookshop: ["books"],
  reading: ["books", "library"],
  park: ["outdoors", "nature"],
  outside: ["outdoors"],
  outdoor: ["outdoors"],
  history: ["history"],
  historic: ["history"],
};

/** Search terms from a request, each a list of alternatives that would satisfy it. */
export function topicTerms(lookingFor: string): string[][] {
  return normalize(lookingFor)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map((word) => [word, ...(SYNONYMS[word] ?? [])]);
}

/** Matches whole words and simple word forms ("walk", "walks", "walking"; "art", "artsy"). */
function wordMatches(word: string, term: string): boolean {
  if (word === term) return true;
  const [short, long] = word.length <= term.length ? [word, term] : [term, word];
  return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 3;
}

/** How many of the request's terms this candidate covers, from its title, category, tags and venue. */
export function topicScore(candidate: Candidate, terms: string[][]): number {
  const words = new Set(
    normalize([candidate.title, candidate.category, candidate.venueName, ...candidate.tags].filter(Boolean).join(" "))
      .split(" ")
      .filter(Boolean),
  );
  let score = 0;
  for (const alternatives of terms) {
    if ([...words].some((word) => alternatives.some((term) => wordMatches(word, term)))) score += 1;
  }
  return score;
}

/**
 * Keeps candidates that match the request, best match first and otherwise in
 * the order given (the heuristic ranking), so the re-ranker sees them first.
 */
export function applyTopic<T extends { candidate: Candidate }>(
  ranked: T[],
  lookingFor?: string | null,
): Focused<T> {
  // A request with no searchable words ("something fun") is left to the re-ranker.
  const terms = lookingFor ? topicTerms(lookingFor) : [];
  if (terms.length === 0) return { items: ranked, matched: null };
  const scored = ranked
    .map((item, index) => ({ item, index, score: topicScore(item.candidate, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.length > 0 ? { items: scored.map((s) => s.item), matched: true } : { items: ranked, matched: false };
}
