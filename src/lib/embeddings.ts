import { EMBEDDING_DIMENSIONS } from "@/lib/config";

/**
 * Text embeddings for interest matching and memory recall, via Voyage AI's
 * REST API. Optional: without VOYAGE_API_KEY everything still runs, the
 * interest term of the matcher is just 0 and recall falls back to recency.
 *
 * The model name is configurable because it changes over time. Whatever you
 * pick must output EMBEDDING_DIMENSIONS values to match the vector columns.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || texts.length === 0) return null;

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: texts,
      model: process.env.VOYAGE_MODEL ?? "voyage-3.5",
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  const vectors = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding model returned ${v.length} dimensions; the schema expects ${EMBEDDING_DIMENSIONS}.`,
      );
    }
  }
  return vectors;
}

/** pgvector's text form, which is how a vector travels through supabase-js. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
