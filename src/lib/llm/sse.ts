/**
 * Repairs a streamed Messages API reply that comes through a gateway.
 *
 * MIT Parley removes the model's thinking block from the stream but still
 * forwards that block's signature event, addressed to index -1. The SDK's
 * stream reader looks up the block an event belongs to and throws when there
 * is none ("Cannot read properties of undefined (reading 'type')"), which
 * ends the chat turn. Events for a block that never started carry nothing the
 * app can use, so they are dropped here before the SDK reads the stream.
 */

const EVENT_BREAK = /\r?\n\r?\n/;

/** True when this server-sent event refers to a content block that was never started. */
export function isOrphanBlockEvent(rawEvent: string, started: Set<number>): boolean {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return false;

  let event: { type?: unknown; index?: unknown };
  try {
    event = JSON.parse(data);
  } catch {
    return false; // Not ours to judge; let the SDK report it.
  }

  if (event.type === "message_start") {
    started.clear();
    return false;
  }
  if (typeof event.index !== "number") return false;
  if (event.type === "content_block_start") {
    started.add(event.index);
    return false;
  }
  if (event.type === "content_block_delta" || event.type === "content_block_stop") {
    return !started.has(event.index);
  }
  return false;
}

/** Passes a server-sent event stream through, minus events for blocks that never started. */
export function dropOrphanBlockEvents(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const started = new Set<number>();
  let buffer = "";

  const emitComplete = (controller: TransformStreamDefaultController<Uint8Array>) => {
    for (;;) {
      const match = EVENT_BREAK.exec(buffer);
      if (!match) return;
      const end = match.index + match[0].length;
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end);
      if (!isOrphanBlockEvent(raw, started)) controller.enqueue(encoder.encode(raw));
    }
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        emitComplete(controller);
      },
      flush(controller) {
        buffer += decoder.decode();
        emitComplete(controller);
        if (buffer) controller.enqueue(encoder.encode(buffer));
      },
    }),
  );
}

/** A fetch that repairs event streams and leaves every other response alone. */
export const fetchWithStreamRepair: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.includes("text/event-stream")) return response;
  return new Response(dropOrphanBlockEvents(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
