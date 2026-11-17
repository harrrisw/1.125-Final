import { z } from "zod";
import type { NewFact } from "@/lib/memory/profile";
import { clampEnergy, type StateSignal } from "@/lib/memory/state";
import { MEMORY_KINDS, SOCIAL_VALUES } from "@/lib/types";

/**
 * What the Understand step pulls out of one user message. The schema carries
 * no numeric bounds because structured outputs do not enforce them; ranges are
 * described in words and clamped in normalizeExtraction().
 */
export const ExtractionSchema = z.object({
  state: z.object({
    mood: z
      .array(z.string())
      .describe(
        "Up to 3 lowercase mood words the user expressed about right now, such as tired, calm, adventurous. Empty if they said nothing about how they feel.",
      ),
    energy: z
      .number()
      .nullable()
      .describe("1 (drained) to 5 (buzzing), only if the message makes it clear. Otherwise null."),
    social: z
      .enum(SOCIAL_VALUES)
      .nullable()
      .describe(
        "Who they want around right now: solo, small_group (a few people), or open (happy to join a crowd or strangers). Null if not expressed.",
      ),
    time_budget_minutes: z
      .number()
      .nullable()
      .describe(
        "Free time they mention, in minutes. For a range use the upper end. Null if not mentioned.",
      ),
  }),
  facts: z
    .array(
      z.object({
        kind: z.enum(MEMORY_KINDS),
        content: z
          .string()
          .describe("One short statement without a subject, such as 'avoids loud places'."),
        confidence: z.number().describe("0 to 1: how sure you are the user meant this as lasting."),
      }),
    )
    .describe("Lasting facts worth remembering for months. Empty if the message has none."),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;

export interface Extraction {
  state: StateSignal;
  facts: NewFact[];
}

export const EMPTY_EXTRACTION: Extraction = {
  state: { mood: [], energy: null, social: null, timeBudgetMinutes: null },
  facts: [],
};

const MAX_FACTS_PER_MESSAGE = 5;
const MAX_TIME_BUDGET_MINUTES = 24 * 60;

export function normalizeExtraction(raw: RawExtraction): Extraction {
  const mood = [...new Set(raw.state.mood.map((m) => m.trim().toLowerCase()).filter(Boolean))].slice(0, 3);

  const minutes = raw.state.time_budget_minutes;
  const timeBudgetMinutes =
    minutes !== null && Number.isFinite(minutes) && minutes > 0
      ? Math.min(Math.round(minutes), MAX_TIME_BUDGET_MINUTES)
      : null;

  const facts = raw.facts
    .map((f) => ({
      kind: f.kind,
      content: f.content.trim().slice(0, 500),
      confidence: Math.min(1, Math.max(0, Number.isFinite(f.confidence) ? f.confidence : 0.5)),
    }))
    .filter((f) => f.content.length > 0)
    .slice(0, MAX_FACTS_PER_MESSAGE);

  return {
    state: { mood, energy: clampEnergy(raw.state.energy), social: raw.state.social, timeBudgetMinutes },
    facts,
  };
}
