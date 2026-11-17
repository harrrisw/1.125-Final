import { z } from "zod";
import { runTurn } from "@/lib/agent/run";
import { requireSession } from "@/lib/auth";
import { describeLlmError } from "@/lib/llm/client";
import type { TurnEvent } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ text: z.string().trim().min(1).max(2000) });

/**
 * One chat turn, streamed as newline-delimited JSON (see TurnEvent).
 * The agent gets the caller's session client and nothing stronger.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send a message of 1 to 2000 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TurnEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await runTurn({
          db: session.db,
          userId: session.user.id,
          text: parsed.data.text,
          emit,
        });
      } catch (err) {
        console.error("chat turn failed", err);
        emit({ type: "error", message: describeLlmError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
