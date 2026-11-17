import { z } from "zod";

/**
 * The confirm gate's vocabulary: which actions exist, what each payload looks
 * like, and which status changes are legal. Pure, so it is shared by the agent
 * tools, the confirm endpoint and the tests.
 *
 * The agent can only ever *propose* one of these. See src/lib/gate/propose.ts
 * (reachable from agent tools) versus src/lib/gate/execute.ts (reachable only
 * from the confirm endpoint).
 */

export const ACTION_TYPES = ["post_mood", "post_plan", "join_post", "calendar_add"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_STATUSES = [
  "proposed",
  "confirmed",
  "executed",
  "cancelled",
  "failed",
  "expired",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

const isoDateTime = z.iso.datetime({ offset: true });

export const PostMoodPayload = z.object({
  body: z.string().trim().min(1).max(500),
  area: z.string().trim().max(80).optional(),
  expires_in_hours: z.number().int().min(1).max(72).optional(),
});

export const PostPlanPayload = z.object({
  body: z.string().trim().min(1).max(500),
  activity_id: z.uuid().optional(),
  area: z.string().trim().max(80).optional(),
  starts_at: isoDateTime,
  capacity: z.number().int().min(2).max(50).optional(),
});

export const JoinPostPayload = z.object({
  post_id: z.uuid(),
});

export const CalendarAddPayload = z.object({
  title: z.string().trim().min(1).max(200),
  starts_at: isoDateTime,
  ends_at: isoDateTime,
  location: z.string().trim().max(200).optional(),
  post_id: z.uuid().optional(),
});

export const PAYLOAD_SCHEMAS = {
  post_mood: PostMoodPayload,
  post_plan: PostPlanPayload,
  join_post: JoinPostPayload,
  calendar_add: CalendarAddPayload,
} as const;

export type ActionPayload<T extends ActionType = ActionType> = z.infer<(typeof PAYLOAD_SCHEMAS)[T]>;

export function parsePayload<T extends ActionType>(type: T, payload: unknown): ActionPayload<T> {
  return PAYLOAD_SCHEMAS[type].parse(payload) as ActionPayload<T>;
}

/** Actions whose execution writes to a public table. */
export const PUBLIC_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  "post_mood",
  "post_plan",
  "join_post",
]);

/** The text that would become visible to other people, if any. Moderated before execution. */
export function publicTextOf(type: ActionType, payload: unknown): string | null {
  if (type === "post_mood" || type === "post_plan") {
    return parsePayload(type, payload).body;
  }
  return null;
}

const TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  proposed: ["confirmed", "cancelled", "expired"],
  confirmed: ["executed", "failed"],
  executed: [],
  cancelled: [],
  failed: [],
  expired: [],
};

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** One line for the confirm card, in plain words. */
export function summarize(type: ActionType, payload: unknown): string {
  switch (type) {
    case "post_mood":
      return "Share this mood on the public board";
    case "post_plan": {
      const p = parsePayload("post_plan", payload);
      return p.capacity
        ? `Post this plan on the public board (up to ${p.capacity} people)`
        : "Post this plan on the public board";
    }
    case "join_post":
      return "Join this and show your name to the group";
    case "calendar_add": {
      const p = parsePayload("calendar_add", payload);
      return `Add "${p.title}" to your Google Calendar`;
    }
  }
}
