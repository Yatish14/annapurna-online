import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { vectorText } from "./ingest";

/**
 * Searching the help guides (6.7): embed the question with the same model as the guides, then ask Postgres for the
 * sections whose vectors are closest. pgvector's `<=>` is the cosine distance (1 − cosine similarity: 0 = same
 * direction), so ORDER BY it, smallest first, puts the best matches on top.
 * No "@/" imports: the retrieval eval (scripts/kb-eval.ts) runs it with plain Node.
 */

type Run = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export type HelpHit = {
  source: string;
  guide: string;
  section: string;
  text: string;
  /** Cosine similarity, 0 to 1: higher is closer */
  score: number;
};

/** The closest few: enough to cover a question that spans two sections, few enough to keep the prompt short */
export const TOP_K = 5;

/** The `k` sections closest to a question */
export async function searchGuides(run: Run, embedder: EmbeddingsInterface, question: string, k = TOP_K): Promise<HelpHit[]> {
  const vector = vectorText(await embedder.embedQuery(question));
  const rows = await run<HelpHit>(
    `SELECT source, guide, section, text, 1 - (embedding <=> $1) AS score
     FROM kb_chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vector, k],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
