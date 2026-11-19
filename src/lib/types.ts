import type { ActionType } from "@/lib/gate/actions";

export type Social = "solo" | "small_group" | "open";
export const SOCIAL_VALUES = ["solo", "small_group", "open"] as const;

export type MemoryKind = "interest" | "like" | "dislike" | "constraint" | "outing";
export const MEMORY_KINDS = ["interest", "like", "dislike", "constraint", "outing"] as const;

/** Layer 2 memory: how the user feels right now. Fades after a few hours. */
export interface CurrentState {
  mood: string[];
  /** 1 = drained, 5 = buzzing. */
  energy: number | null;
  social: Social | null;
  timeBudgetMinutes: number | null;
  expiresAt: string;
}

/** Layer 1 memory: a durable fact about the user. */
export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  sourceMessageId: string | null;
  editedByUser: boolean;
  createdAt: string;
}

/** Something the matcher can offer: a place or event, or someone's open plan. */
export interface Candidate {
  /** Activity id, or the post id when kind is "open_plan". */
  id: string;
  kind: "activity" | "open_plan";
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  venueName: string | null;
  /** Street address, for map links. */
  address?: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  /** Null means "any time" (a place rather than a dated event). */
  startsAt: string | null;
  durationMinutes: number | null;
  /** 1 = restful, 5 = intense. */
  energy: number | null;
  /** 1 = hushed, 5 = loud. */
  noise: number | null;
  groupFit: Social[];
  url: string | null;
  /** Best cosine similarity against the user's interests, likes and past outings. */
  interestSim: number;
  /** Best cosine similarity against the user's dislikes. */
  dislikeSim: number;
  plan?: {
    hostName: string;
    goingCount: number;
    capacity: number | null;
  };
}

/** UI attachments on an assistant message. Stored in messages.cards. */
export type Card =
  | { type: "noted"; memoryId: string; kind: MemoryKind; content: string }
  | {
      type: "pick";
      candidateId: string;
      kind: Candidate["kind"];
      title: string;
      reason: string;
      startsAt: string | null;
      area: string | null;
      /** The venue's own website, when the catalog has one. */
      url: string | null;
      /** For the map. Optional because cards saved before the map existed lack them. */
      venueName?: string | null;
      address?: string | null;
      lat?: number | null;
      lng?: number | null;
    }
  | { type: "plan_saved"; planId: string; title: string; stopCount: number }
  | {
      type: "confirm";
      actionId: string;
      actionType: ActionType;
      summary: string;
      /** The exact text that would go public, when there is any. */
      publicText: string | null;
      expiresAt: string;
    };

/** One stop of a saved plan. Venue details are copied in when the plan is saved. */
export interface PlanStop {
  id: string;
  activityId: string | null;
  title: string;
  venueName: string | null;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  note: string | null;
  startsAt: string | null;
}

/** A private itinerary the user kept from a conversation: stops in visiting order. */
export interface SavedPlan {
  id: string;
  title: string;
  note: string | null;
  createdAt: string;
  stops: PlanStop[];
}

/** One line of the chat endpoint's newline-delimited JSON stream. */
export type TurnEvent =
  | { type: "text"; delta: string }
  | { type: "cards"; cards: Card[] }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: Card[];
  createdAt: string;
}
