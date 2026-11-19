import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTurnContext, SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { buildAgentTools, type ToolContext } from "@/lib/agent/tools";
import { insertMessage, loadMessages, loadRecentDrafts } from "@/lib/chat/store";
import { HISTORY_MESSAGES, MODELS, RECALL_LIMIT } from "@/lib/config";
import { listSavedPlans } from "@/lib/itineraries";
import { anthropic, messageThreadParams, refusalFallbackParams } from "@/lib/llm/client";
import { addFacts, dedupeFacts, listMemory, recall } from "@/lib/memory/profile";
import { hasSignal, loadState, mergeState, saveState } from "@/lib/memory/state";
import type { Card, ChatMessage, CurrentState, TurnEvent } from "@/lib/types";
import { extractTurn } from "@/lib/understand/extract";

/**
 * One chat turn: Understand -> Remember -> Recall -> Agent (Match, Offer).
 * "Act" is not here on purpose. It lives behind the confirm endpoint.
 */

export interface RunTurnInput {
  /** Session client for the signed-in user. The agent never gets anything stronger. */
  db: SupabaseClient;
  userId: string;
  text: string;
  emit: (event: TurnEvent) => void;
}

const MAX_AGENT_ITERATIONS = 8;

/** Prior turns as plain text. The API needs the first message to be from the user. */
export function toHistoryParams(history: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const params: Anthropic.Beta.BetaMessageParam[] = history
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
  while (params.length > 0 && params[0].role !== "user") params.shift();
  return params;
}

/**
 * Understand + Remember. A failure here must not sink the turn: the user still
 * gets a reply, the agent just works from what was already known.
 */
async function understandAndRemember(
  db: SupabaseClient,
  userId: string,
  text: string,
  messageId: string,
  history: ChatMessage[],
  now: Date,
): Promise<{ state: CurrentState | null; noted: Card[] }> {
  const previous = await loadState(db, userId, now);
  try {
    const known = await listMemory(db, userId);
    const extraction = await extractTurn({
      message: text,
      recent: history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
      knownFacts: known.map((m) => `[${m.kind}] ${m.content}`),
    });

    const state = mergeState(previous, extraction.state, now);
    if (state && hasSignal(extraction.state)) {
      await saveState(db, userId, state, messageId);
    }

    const added = await addFacts(db, userId, dedupeFacts(extraction.facts, known), messageId);
    const noted: Card[] = added.map((m) => ({
      type: "noted",
      memoryId: m.id,
      kind: m.kind,
      content: m.content,
    }));
    return { state, noted };
  } catch (err) {
    console.error("understand step failed; continuing with existing memory", err);
    return { state: previous, noted: [] };
  }
}

export async function runTurn({ db, userId, text, emit }: RunTurnInput): Promise<void> {
  const now = new Date();

  const userMessage = await insertMessage(db, userId, "user", text);
  const history = (await loadMessages(db, userId, HISTORY_MESSAGES + 1)).filter(
    (m) => m.id !== userMessage.id,
  );

  const { state, noted } = await understandAndRemember(db, userId, text, userMessage.id, history, now);
  if (noted.length > 0) emit({ type: "cards", cards: noted });

  const [memories, drafts, plans] = await Promise.all([
    recall(db, userId, text, RECALL_LIMIT),
    loadRecentDrafts(db, userId),
    // Saved plans are an extra: a turn still works if they cannot be loaded.
    // undefined (not []) then, so the context does not claim there are none.
    listSavedPlans(db, userId, 5).catch((err) => {
      console.error("could not load saved plans for context", err instanceof Error ? err.message : err);
      return undefined;
    }),
  ]);

  const ctx: ToolContext = {
    db,
    userId,
    sourceMessageId: userMessage.id,
    memories: memories.map((m) => `[${m.kind}] ${m.content}`),
    cards: [],
    now,
  };

  const runner = anthropic().beta.messages.toolRunner({
    model: MODELS.agent,
    max_tokens: 16000,
    ...messageThreadParams(),
    ...refusalFallbackParams(),
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: buildAgentTools(ctx),
    messages: [
      ...toHistoryParams(history),
      {
        role: "user",
        content: `${buildTurnContext({ now, state, memories, history, drafts, plans })}\n\n${text}`,
      },
    ],
    stream: true,
    max_iterations: MAX_AGENT_ITERATIONS,
  });

  let reply = "";
  let cardsSent = 0;
  let stopReason: string | null = null;

  const flushCards = () => {
    if (ctx.cards.length > cardsSent) {
      emit({ type: "cards", cards: ctx.cards.slice(cardsSent) });
      cardsSent = ctx.cards.length;
    }
  };
  const say = (delta: string) => {
    reply += delta;
    emit({ type: "text", delta });
  };

  // Each iteration is one model response. Tools from the previous response run
  // before the next one starts, so their cards are ready to flush here.
  for await (const stream of runner) {
    flushCards();
    let started = false;
    stream.on("text", (delta) => {
      if (!started && reply !== "") say("\n\n");
      started = true;
      say(delta);
    });
    const message = await stream.finalMessage();
    stopReason = message.stop_reason;
  }
  flushCards();

  if (reply.trim() === "") {
    say(
      stopReason === "refusal"
        ? "I can't help with that one. Want some ideas for what to do with your free time instead?"
        : "I got a bit lost there. Could you say that again?",
    );
  }

  const saved = await insertMessage(db, userId, "assistant", reply, [...noted, ...ctx.cards]);
  emit({ type: "done", messageId: saved.id });
}
