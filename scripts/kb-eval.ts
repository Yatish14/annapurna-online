// Annapurna Assist, task 6.11: the retrieval eval. Does the help search find the right guide?
// Each line of evals/retrieval.jsonl is a question and the guide(s) that answer it. We search, and measure:
// - recall@k: how many questions had a right guide in the top k sections (k = 1, 3, 5). search_help gives the model
//   the top 5, so recall@5 is "the model had the answer in front of it"; recall@3 is the plan's target.
// - MRR (mean reciprocal rank): 1 if the right guide is first, 1/2 if second, 1/3 if third… averaged. One number
//   for "how high up", where recall only says "in or out".
//
//   npm run kb:eval                    searches kb_chunks in DATABASE_URL (run npm run kb:ingest first)
//   npm run kb:eval -- --chars 500     splits the guides again at 500 characters and searches in memory (6.12)
//   npm run kb:eval -- --mode hybrid   keyword search (--mode keyword) or both merged (--mode hybrid) in kb_chunks (6.13)
//
// Embeddings are kept in .data/kb-eval-cache.json by fingerprint, so a rerun costs nothing.
// Uses: 1 request per question (embedded together), plus each section not in the cache. Free tier.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { splitGuides } from "../lib/assistant/kb/chunks";
import { cosineSimilarity, EMBEDDING_MODEL, embeddings, GeminiEmbeddings } from "../lib/assistant/kb/embeddings";
import { type HelpHit, searchByVector, searchByWords, searchHybrid } from "../lib/assistant/kb/search";
import { connect, describeTarget } from "./db.mjs";

type Case = { question: string; expect: string[] };

const args = process.argv.slice(2);
const chars = args.includes("--chars") ? Number(args[args.indexOf("--chars") + 1]) : null;
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "vector";
if (!["vector", "keyword", "hybrid"].includes(mode) || (chars !== null && mode !== "vector")) {
  console.error("✗ --mode is vector, keyword or hybrid, and only for the database (not with --chars)");
  process.exit(1);
}
const fake = process.env.ASSISTANT_FAKE === "1";
const K = 5;

const cases: Case[] = readFileSync("evals/retrieval.jsonl", "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// The questions, all in one request, embedded as queries (the guides were embedded as documents)
const asQueries = fake ? embeddings() : new GeminiEmbeddings({ taskType: "RETRIEVAL_QUERY" });
const questionVectors = await asQueries.embedDocuments(cases.map((c) => c.question));

/** Each question's top K sections, from the database or from the guides split in memory */
let results: HelpHit[][];
let where: string;
if (chars === null) {
  where = `kb_chunks in ${describeTarget()}, ${mode} search`;
  const db = await connect();
  try {
    results = [];
    for (const [i, v] of questionVectors.entries()) {
      const q = cases[i].question;
      results.push(
        mode === "keyword" ? await searchByWords(db.query, q, K) : mode === "hybrid" ? await searchHybrid(db.query, v, q, K) : await searchByVector(db.query, v, K),
      );
    }
  } finally {
    await db.close();
  }
} else {
  const files = readdirSync("knowledge")
    .filter((f) => f.endsWith(".md"))
    .map((source) => ({ source, markdown: readFileSync(`knowledge/${source}`, "utf8") }));
  const chunks = splitGuides(files, chars);
  where = `the guides split at ${chars} characters: ${chunks.length} sections, in memory`;
  // The cache: fingerprint → vector. Only sections it hasn't seen are embedded.
  const CACHE = ".data/kb-eval-cache.json";
  const cache: Record<string, number[]> = !fake && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const missing = chunks.filter((c) => !cache[c.hash]);
  if (missing.length) {
    console.log(`Embedding ${missing.length} sections not in the cache (about ${Math.ceil(missing.length / 50) * 31} s on the free tier)…`);
    const vectors = await embeddings().embedDocuments(missing.map((c) => c.text));
    missing.forEach((c, i) => (cache[c.hash] = vectors[i]));
    if (!fake) {
      mkdirSync(".data", { recursive: true });
      writeFileSync(CACHE, JSON.stringify(cache));
    }
  }
  // Exact search: every section, sorted by similarity. (The database does the same with <=>, or near it with HNSW.)
  results = questionVectors.map((q) =>
    chunks
      .map((c) => ({ source: c.source, guide: c.guide, section: c.section, text: c.text, score: cosineSimilarity(q, cache[c.hash]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K),
  );
}

// Score each question: the rank (1…K) of the first section from a right guide, or null if none in the top K
const ranks = cases.map((c, i) => {
  const at = results[i].findIndex((h) => c.expect.includes(h.source));
  return at === -1 ? null : at + 1;
});
const recall = (k: number) => ranks.filter((r) => r !== null && r <= k).length / cases.length;
const mrr = ranks.reduce<number>((sum, r) => sum + (r ? 1 / r : 0), 0) / cases.length;
const pct = (x: number) => `${Math.round(x * 100)}%`;

console.log(`\n${cases.length} questions against ${where}, ${fake ? "fake embeddings" : EMBEDDING_MODEL}\n`);
cases.forEach((c, i) => {
  const r = ranks[i];
  const top = results[i][0];
  const mark = r === 1 ? "✓ 1st" : r ? `~ ${r}${r === 2 ? "nd" : r === 3 ? "rd" : "th"}` : "✗ —  ";
  console.log(`${mark}  ${c.question.slice(0, 58).padEnd(58)}  top: ${top ? `${top.source} › ${top.section} (${top.score.toFixed(2)})` : "nothing"}`);
});
console.log(`\nrecall@1 ${pct(recall(1))}   recall@3 ${pct(recall(3))}   recall@5 ${pct(recall(5))}   MRR ${mrr.toFixed(2)}`);

// Saved, so runs can be compared later (6.12)
const label = chars !== null ? `chars-${chars}` : mode === "vector" ? "db" : `db-${mode}`;
mkdirSync("evals/results", { recursive: true });
const file = `evals/results/retrieval-${label}${fake ? "-fake" : ""}.json`;
writeFileSync(
  file,
  `${JSON.stringify(
    {
      ran: new Date().toISOString(),
      where,
      embeddings: fake ? "fake" : EMBEDDING_MODEL,
      recall_at_1: recall(1),
      recall_at_3: recall(3),
      recall_at_5: recall(5),
      mrr: Number(mrr.toFixed(3)),
      questions: cases.map((c, i) => ({ ...c, rank: ranks[i], top: results[i].map((h) => `${h.source} › ${h.section} (${h.score.toFixed(3)})`) })),
    },
    null,
    2,
  )}\n`,
);
console.log(`Saved to ${file}`);
