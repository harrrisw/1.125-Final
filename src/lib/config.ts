export const MODELS = {
  /** Runs the agent loop for each chat turn. */
  agent: process.env.OFFHOURS_AGENT_MODEL ?? "claude-opus-5-5",
  /** High-volume structured calls: extraction, re-rank, moderation, tagging. */
  worker: process.env.OFFHOURS_WORKER_MODEL ?? "claude-haiku-5-5",
};

/** The pilot is one community. Everything location-based is relative to this. */
export const COMMUNITY = {
  name: "Boston-area students",
  /** Added to map searches so a venue name resolves to the right place. */
  region: "Boston, MA",
  state: "MA",
  timezone: "America/New_York",
  center: { lat: 42.3601, lng: -71.0942 },
  radiusKm: 12,
};

/** How long a mood stays live before it is ignored. */
export const STATE_TTL_HOURS = 6;

/** Must match the vector(...) size in supabase/migrations. */
export const EMBEDDING_DIMENSIONS = 1024;

/** Prior chat turns replayed to the agent each turn (text only). */
export const HISTORY_MESSAGES = 12;

/** Long-term memories recalled into the agent's context each turn. */
export const RECALL_LIMIT = 8;

/** Candidates the heuristic ranker hands to the LLM re-ranker. */
export const RERANK_POOL = 12;

/** Picks shown to the user. The success criterion is a top-3 hit rate. */
export const PICKS = 3;
