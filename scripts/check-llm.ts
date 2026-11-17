/**
 * Checks the Claude connection with every kind of call the app makes.
 *   npm run check:llm
 * Reads ANTHROPIC_API_KEY and OFFHOURS_LLM_BASE_URL from .env.local, lists the
 * models the key can reach, then runs extraction, re-rank, moderation and a
 * small agent loop. About six short calls. Works against Anthropic directly or
 * through a gateway such as MIT Parley. The key is never printed.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MODELS } from "@/lib/config";
import {
  anthropic,
  eagerToolInput,
  llmExtras,
  llmHost,
  messageThreadParams,
  refusalFallbackParams,
} from "@/lib/llm/client";
import { askModelToRerank } from "@/lib/matcher/rerank";
import { rank } from "@/lib/matcher/score";
import { askModelForVerdict } from "@/lib/safety/moderation";
import type { Candidate, CurrentState } from "@/lib/types";
import { extractTurn } from "@/lib/understand/extract";

const TEST_WORD = "lighthouse";

function explain(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `HTTP ${err.status ?? "?"}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Runs one check, prints PASS or FAIL with its detail lines, and returns whether it passed. */
async function check(run: () => Promise<{ ok: boolean; lines: string[] }>): Promise<boolean> {
  try {
    const { ok, lines } = await run();
    lines.forEach((line, i) => console.log(i === 0 ? `  ${ok ? "PASS" : "FAIL"}  ${line}` : `        ${line}`));
    return ok;
  } catch (err) {
    console.log(`  FAIL  ${explain(err)}`);
    return false;
  }
}

/** Model ids the key can list, or null when the endpoint has no usable listing. */
async function listModels(): Promise<string[] | null> {
  const ids: string[] = [];
  try {
    for await (const model of anthropic().models.list({ limit: 100 })) {
      ids.push(model.id);
      if (ids.length >= 500) break;
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw err;
    console.log(`  Could not list models (${explain(err)}). Continuing with the configured ids.`);
    return null;
  }
  return ids.length > 0 ? ids : null;
}

function reportModel(role: string, id: string, variable: string, available: string[] | null) {
  if (!available) {
    console.log(`  ${role}: ${id} (not checked against a list)`);
  } else if (available.includes(id)) {
    console.log(`  ${role}: ${id} is available`);
  } else {
    console.log(`  ${role}: ${id} is NOT in the list. Set ${variable} in .env.local to one that is.`);
  }
}

/** The Understand step, exactly as a chat turn runs it. */
async function checkExtraction() {
  const extraction = await extractTurn({
    message: "Long week. I want something quiet tonight, maybe with one friend. I never like loud bars.",
    recent: [],
    knownFacts: [],
  });
  const facts = extraction.facts.map((f) => `[${f.kind}] ${f.content}`).join("; ") || "(none)";
  return { ok: true, lines: [`state: ${JSON.stringify(extraction.state)}`, `facts: ${facts}`] };
}

function sampleCandidate(id: string, title: string, energy: number, noise: number): Candidate {
  return {
    id,
    kind: "activity",
    title,
    description: null,
    category: null,
    tags: [],
    venueName: null,
    area: "Cambridge",
    lat: null,
    lng: null,
    startsAt: null,
    durationMinutes: 90,
    energy,
    noise,
    groupFit: ["solo", "small_group"],
    url: null,
    interestSim: 0.5,
    dislikeSim: 0,
  };
}

/** The matcher's last step: the model picks from a shortlist and explains each pick. */
async function checkRerank() {
  const state: CurrentState = {
    mood: ["tired"],
    energy: 2,
    social: "small_group",
    timeBudgetMinutes: 120,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  const pool = rank(
    [
      sampleCandidate("a1", "Tea and board games at a quiet cafe", 2, 2),
      sampleCandidate("a2", "Live band night at a packed bar", 5, 5),
      sampleCandidate("a3", "Evening walk through the sculpture garden", 2, 1),
    ],
    state,
  );
  const chosen = await askModelToRerank(pool, {
    state,
    memories: ["[dislike] avoids loud bars"],
    limit: 2,
  });
  if (!chosen) return { ok: false, lines: ["the model declined to answer"] };
  const known = new Set(pool.map((s) => s.candidate.id));
  const ok = chosen.length > 0 && chosen.every((c) => known.has(c.id));
  return {
    ok,
    lines: chosen.length
      ? chosen.map((c) => `${c.id}: ${c.reason}`)
      : ["the model returned no picks"],
  };
}

/** The check on text before it goes public: one post that should pass, one that should not. */
async function checkModeration() {
  const fine = await askModelForVerdict("Anyone up for a walk along the Esplanade around 6? All welcome.");
  const notFine = await askModelForVerdict("Party in my dorm room tonight, come up to room 412 and bring drinks.");
  if (!fine || !notFine) return { ok: false, lines: ["the model declined to answer"] };
  return {
    ok: fine.allowed && !notFine.allowed,
    lines: [
      `public walk: ${fine.allowed ? "allowed" : `rejected (${fine.reason})`}`,
      `dorm-room party: ${notFine.allowed ? "allowed" : `rejected (${notFine.reason})`}`,
    ],
  };
}

/** The agent path: streaming tool runner with one tool, as in src/lib/agent/run.ts. */
async function checkAgent(extras: boolean) {
  let toolCalled = false;
  const getTestWord = betaZodTool({
    name: "get_test_word",
    description: "Returns the test word. Call this once when asked for the test word.",
    inputSchema: z.object({}),
    ...eagerToolInput(extras),
    run: async () => {
      toolCalled = true;
      return TEST_WORD;
    },
  });

  const runner = anthropic().beta.messages.toolRunner({
    model: MODELS.agent,
    max_tokens: 4000,
    ...messageThreadParams(extras),
    ...refusalFallbackParams(extras),
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: "You are a connection test. Do exactly what the user asks.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [getTestWord],
    messages: [{ role: "user", content: "Call get_test_word, then reply with only that word." }],
    stream: true,
    max_iterations: 3,
  });

  let reply = "";
  let stopReason: string | null = null;
  for await (const stream of runner) {
    stream.on("text", (delta) => {
      reply += delta;
    });
    stopReason = (await stream.finalMessage()).stop_reason;
  }

  return {
    ok: toolCalled && reply.toLowerCase().includes(TEST_WORD),
    lines: [
      `tool called: ${toolCalled ? "yes" : "no"}, stop reason: ${stopReason}, reply: ${JSON.stringify(reply.trim().slice(0, 80))}`,
    ],
  };
}

async function main() {
  const host = llmHost();
  const extras = llmExtras();
  console.log(`Endpoint: ${host}`);
  console.log(
    `Anthropic-only request features (message threads, refusal fallback, eager tool input): ${extras ? "on" : "off"}`,
  );

  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    console.log("\nANTHROPIC_API_KEY is not set. Add it to .env.local and run this again.");
    process.exit(1);
  }

  console.log("\n1. Models");
  let available: string[] | null;
  try {
    available = await listModels();
  } catch (err) {
    console.log(`  FAIL  ${host} rejected the key (${explain(err)}).`);
    console.log("  Check ANTHROPIC_API_KEY and OFFHOURS_LLM_BASE_URL in .env.local.");
    process.exit(1);
  }
  if (available) {
    const claude = available.filter((id) => /claude/i.test(id));
    console.log(`  ${available.length} models listed; Claude models: ${claude.join(", ") || "(none)"}`);
  }
  reportModel("agent", MODELS.agent, "OFFHOURS_AGENT_MODEL", available);
  reportModel("worker", MODELS.worker, "OFFHOURS_WORKER_MODEL", available);

  const results: boolean[] = [];

  console.log(`\n2. Extraction (${MODELS.worker})`);
  results.push(await check(checkExtraction));

  console.log(`\n3. Re-rank (${MODELS.worker})`);
  results.push(await check(checkRerank));

  console.log(`\n4. Moderation (${MODELS.worker})`);
  results.push(await check(checkModeration));

  console.log(`\n5. Agent loop: streaming with a tool (${MODELS.agent})`);
  const agentOk = await check(() => checkAgent(extras));
  results.push(agentOk);

  if (agentOk && !extras) {
    // Informational only: the app does not need these, so a rejection here is not a failure.
    console.log("\n6. Does this endpoint take the Anthropic-only features?");
    let accepted = false;
    let why = "";
    try {
      accepted = (await checkAgent(true)).ok;
    } catch (err) {
      why = ` (${explain(err).slice(0, 140)})`;
    }
    console.log(
      accepted
        ? "  Yes. You can set OFFHOURS_LLM_EXTRAS=on."
        : `  No${why}. Leave OFFHOURS_LLM_EXTRAS unset; the app works without them.`,
    );
  }

  const allOk = results.every(Boolean);
  console.log(
    allOk
      ? "\nThe Claude connection works for every kind of call the app makes."
      : "\nThe Claude connection is not ready. See the FAIL lines above.",
  );
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(explain(err));
  process.exit(1);
});
