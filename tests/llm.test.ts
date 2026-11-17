import { describe, expect, it } from "vitest";
import { dropOrphanBlockEvents, isOrphanBlockEvent } from "@/lib/llm/sse";

function sse(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/** Feeds `text` through the filter in chunks of `size` bytes and returns what comes out. */
async function filter(text: string, size: number): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(dropOrphanBlockEvents(source)).text();
}

// What MIT Parley sent on 2026-11-16 for a reply whose thinking block it removed.
const orphan = sse("content_block_delta", { index: -1, delta: { type: "signature_delta", signature: "abc" } });
const good = [
  sse("message_start", { message: { id: "msg_1", content: [] } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Tea and board games — café" } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" } }),
  sse("message_stop", {}),
];

describe("stream repair for gateways", () => {
  it("drops an event for a block that never started and keeps the rest byte for byte", async () => {
    const withOrphan = [good[0], orphan, ...good.slice(1)].join("");
    expect(await filter(withOrphan, 4096)).toBe(good.join(""));
  });

  it("gives the same result however the bytes are split", async () => {
    const withOrphan = [good[0], orphan, ...good.slice(1)].join("");
    for (const size of [1, 2, 7, 64]) {
      expect(await filter(withOrphan, size)).toBe(good.join(""));
    }
  });

  it("leaves a well-formed stream untouched", async () => {
    expect(await filter(good.join(""), 5)).toBe(good.join(""));
  });

  it("handles CRLF line endings and passes pings and unknown events through", async () => {
    const crlf = [good[0], "event: ping\ndata: {\"type\":\"ping\"}\n\n", orphan, good[1]].join("").replace(/\n/g, "\r\n");
    const expected = [good[0], "event: ping\ndata: {\"type\":\"ping\"}\n\n", good[1]].join("").replace(/\n/g, "\r\n");
    expect(await filter(crlf, 3)).toBe(expected);
  });

  it("forgets started blocks when a new message begins", () => {
    const started = new Set<number>();
    expect(isOrphanBlockEvent(good[1], started)).toBe(false);
    expect(isOrphanBlockEvent(good[2], started)).toBe(false);
    expect(isOrphanBlockEvent(good[0], started)).toBe(false);
    expect(isOrphanBlockEvent(good[2], started)).toBe(true);
  });

  it("does not judge data it cannot parse", () => {
    expect(isOrphanBlockEvent("data: not json\n\n", new Set())).toBe(false);
  });
});
