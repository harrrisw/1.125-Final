import Anthropic from "@anthropic-ai/sdk";
import { fetchWithStreamRepair } from "@/lib/llm/sse";

const ANTHROPIC_HOST = "api.anthropic.com";

let client: Anthropic | null = null;

/**
 * Where Claude requests go. OFFHOURS_LLM_BASE_URL points the app at a gateway
 * that speaks the Anthropic Messages API (for example MIT Parley). Unset, the
 * SDK's own default applies: ANTHROPIC_BASE_URL if present, else Anthropic.
 *
 * The app has its own variable because tools that launch it (Claude Code is
 * one) export ANTHROPIC_BASE_URL into child processes, and a value already in
 * the process environment beats the one in .env.local.
 */
export function llmBaseUrl(): string | undefined {
  return process.env.OFFHOURS_LLM_BASE_URL?.trim() || undefined;
}

/** The host requests will reach, for messages and checks. Never includes a key. */
export function llmHost(): string {
  const url = llmBaseUrl() ?? process.env.ANTHROPIC_BASE_URL?.trim();
  if (!url) return ANTHROPIC_HOST;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Whether to use the three request features that need Anthropic's own API and
 * that a gateway may not pass through: message threads (the server keeps the
 * conversation and each turn sends only what is new), the server-side refusal
 * fallback (a beta), and eager streaming of tool inputs. On by default against
 * Anthropic, off by default through a gateway. OFFHOURS_LLM_EXTRAS=on|off
 * overrides; `npm run check:llm` reports whether a gateway takes them.
 */
export function llmExtras(): boolean {
  const override = process.env.OFFHOURS_LLM_EXTRAS?.trim().toLowerCase();
  if (override === "on") return true;
  if (override === "off") return false;
  return !usesGateway();
}

/**
 * The SDK's tool runner threads by default: after the first request it sends
 * only the new messages and a reference to the last reply. A stateless gateway
 * (MIT Parley is one) then sees a tool result with no tool call and rejects it,
 * so there the full history goes out every turn.
 */
export function messageThreadParams(enabled = llmExtras()) {
  return enabled ? {} : { thread: false as const };
}

/** If the model declines for policy reasons, the API retries on its default fallback. */
export function refusalFallbackParams(enabled = llmExtras()) {
  return enabled
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

/** Per-tool option: stream large tool inputs as they are generated. */
export function eagerToolInput(enabled = llmExtras()) {
  return enabled ? { eager_input_streaming: true } : {};
}

/** Whether requests go somewhere other than Anthropic's own API. */
export function usesGateway(): boolean {
  return llmHost() !== ANTHROPIC_HOST;
}

/**
 * The key comes from ANTHROPIC_API_KEY; the endpoint from llmBaseUrl().
 * Through a gateway, streamed replies are repaired first (see ./sse).
 */
export function anthropic(): Anthropic {
  return (client ??= new Anthropic({
    baseURL: llmBaseUrl(),
    ...(usesGateway() ? { fetch: fetchWithStreamRepair } : {}),
  }));
}

/** A message that is safe to show a user when an LLM call fails. */
export function describeLlmError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The AI service rejected the API key. Check ANTHROPIC_API_KEY and OFFHOURS_LLM_BASE_URL in .env.local.";
  }
  if (error instanceof Anthropic.NotFoundError) {
    return "The AI service does not offer the configured model. Run `npm run check:llm` to see which models it has.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The AI service is busy right now. Give it a moment and try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the AI service. Check your connection and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The AI service returned an error (${error.status ?? "unknown"}). Try again.`;
  }
  return "Something went wrong on our side. Try again.";
}
