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
  return searchByVector(run, await embedder.embedQuery(question), k);
}

/** The `k` sections closest to an already embedded question (the retrieval eval embeds all its questions at once) */
export async function searchByVector(run: Run, vector: number[], k = TOP_K): Promise<HelpHit[]> {
  const rows = await run<HelpHit>(
    `SELECT source, guide, section, text, 1 - (embedding <=> $1) AS score
     FROM kb_chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorText(vector), k],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

// ---------- 6.13 (optional): keyword and hybrid search ----------

/**
 * Keyword search: sections with any of the question's words (stemmed: "recording" finds "record"), best first.
 * ts_rank_cd scores how often and how close together they appear. Common words ("how", "the") are dropped by Postgres.
 * Score here is the rank, not a similarity: don't compare it with the vector search's.
 */
export async function searchByWords(run: Run, question: string, k = TOP_K): Promise<HelpHit[]> {
  // "any of the words": plainto_tsquery would need all of them, which a full question rarely matches
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!words.length) return [];
  const rows = await run<HelpHit>(
    `SELECT source, guide, section, text, ts_rank_cd(words, q) AS score
     FROM kb_chunks, to_tsquery('english', $1) AS q
     WHERE words @@ q
     ORDER BY score DESC, id
     LIMIT $2`,
    [words.join(" | "), k],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/**
 * Hybrid: both searches, merged by reciprocal rank fusion (RRF). Each section scores 1 / (60 + its rank) in each
 * list it's in, added up. Ranks, not scores, so the two kinds of score never need to be on one scale; 60 is the usual
 * constant, which keeps one list's first place from outweighing everything else.
 */
export async function searchHybrid(run: Run, vector: number[], question: string, k = TOP_K): Promise<HelpHit[]> {
  const [byMeaning, byWords] = await Promise.all([searchByVector(run, vector, 20), searchByWords(run, question, 20)]);
  const merged = new Map<string, HelpHit>();
  for (const list of [byMeaning, byWords]) {
    list.forEach((hit, i) => {
      const key = `${hit.source}#${hit.section}`;
      const before = merged.get(key);
      merged.set(key, { ...hit, score: (before?.score ?? 0) + 1 / (60 + i + 1) });
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
