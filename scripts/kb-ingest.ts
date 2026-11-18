// Annapurna Assist, task 6.6: puts the help guides (knowledge/*.md) into the database for search_help.
// Splits each guide at its headings (lib/assistant/kb/chunks.ts), embeds the sections that are new or changed, and
// removes the ones that are gone (lib/assistant/kb/ingest.ts). Unchanged sections keep their stored vectors, so
// running it again costs nothing.
//
//   npm run kb:ingest      the database in DATABASE_URL, with Gemini's embeddings
//                          (ASSISTANT_FAKE=1: fake embeddings, free; the tests use that)
//
// The guides are the same help text for everyone, not business data, so this is allowed on any database.
import { readdirSync, readFileSync } from "node:fs";
import { EMBEDDING_MODEL, embeddings } from "../lib/assistant/kb/embeddings";
import { ingestGuides } from "../lib/assistant/kb/ingest";
import { connect, describeTarget } from "./db.mjs";

const DIR = "knowledge";
const fake = process.env.ASSISTANT_FAKE === "1";
if (!fake && !process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((source) => ({ source, markdown: readFileSync(`${DIR}/${source}`, "utf8") }));
console.log(`${files.length} guides into ${describeTarget()}, with ${fake ? "fake embeddings" : EMBEDDING_MODEL}…`);

const db = await connect();
try {
  const { embedded, unchanged, removed, chunks } = await ingestGuides(db.query, files, embeddings());
  console.log(`✓ ${chunks.length} sections: ${embedded} embedded (new or changed), ${unchanged} unchanged, ${removed} removed.`);
} catch (err) {
  if (!String(err).includes('relation "kb_chunks" does not exist')) throw err;
  console.error("✗ The kb_chunks table isn't there yet. Run npm run db:migrate first.");
  process.exitCode = 1;
} finally {
  await db.close();
}
