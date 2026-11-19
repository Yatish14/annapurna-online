import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { type Chunk, splitGuides } from "./chunks";

/**
 * Puts the help guides into kb_chunks (6.6): embeds the sections that are new or changed, removes the ones that are
 * gone, leaves the rest alone. scripts/kb-ingest.ts runs it; the tests run it on their own database.
 * No "@/" imports: plain Node runs it from the script.
 */

type Run = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export type IngestResult = { embedded: number; unchanged: number; removed: number; chunks: Chunk[] };

/** pgvector reads a vector written as text: '[0.1,0.2,…]' */
export const vectorText = (vector: number[]) => `[${vector.join(",")}]`;

export async function ingestGuides(
  run: Run,
  files: { source: string; markdown: string }[],
  embedder: EmbeddingsInterface,
  maxChars?: number,
): Promise<IngestResult> {
  const chunks = splitGuides(files, maxChars);
  // What's stored already, by fingerprint (lib/assistant/kb/chunks.ts, chunkHash): same text and model, same hash
  const stored = new Set((await run<{ hash: string }>("SELECT hash FROM kb_chunks")).map((r) => r.hash));
  const fresh = chunks.filter((c) => !stored.has(c.hash));
  const kept = chunks.filter((c) => stored.has(c.hash));
  const wanted = new Set(chunks.map((c) => c.hash));
  const gone = [...stored].filter((hash) => !wanted.has(hash));

  // Only what's new is embedded: one request per 100 sections (embedDocuments batches them)
  const vectors = fresh.length ? await embedder.embedDocuments(fresh.map((c) => c.text)) : [];
  for (const [i, c] of fresh.entries()) {
    await run(
      "INSERT INTO kb_chunks (source, guide, section, position, text, hash, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [c.source, c.guide, c.section, c.position, c.text, c.hash, vectorText(vectors[i])],
    );
  }
  // A section that only moved (one added above it) has the same text, so the same hash: just its place changes
  for (const c of kept) {
    await run("UPDATE kb_chunks SET source = $2, position = $3 WHERE hash = $1", [c.hash, c.source, c.position]);
  }
  if (gone.length) await run("DELETE FROM kb_chunks WHERE hash = ANY($1)", [gone]);
  return { embedded: fresh.length, unchanged: kept.length, removed: gone.length, chunks };
}
