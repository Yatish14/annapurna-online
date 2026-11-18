// The eval database (8.5): a fresh PGlite folder with the tables, the sample data (scripts/seed-expenses.mjs: made-up
// customers, drivers and bookings, never real ones), the help guides, and an admin for the drafts to belong to.
// Never Docker or Neon.
//
//   npm run eval:setup      (ASSISTANT_FAKE=1: fake embeddings for the guides, free; otherwise Gemini's, ~104 requests)
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { embeddings } from "../lib/assistant/kb/embeddings";
import { ingestGuides } from "../lib/assistant/kb/ingest";

export const EVAL_DB = "./.data/pglite-eval";
process.env.DATABASE_URL = `pglite:${EVAL_DB}`;
rmSync(EVAL_DB, { recursive: true, force: true });

// The same steps as `npm run db:migrate` and `npm run db:seed-expenses`, on this folder
const { connect, schemaSql } = await import("../scripts/db.mjs");
const db = await connect();
await db.exec(schemaSql);
await db.query(
  "INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ('9000000099', 'Eval Admin', 'admin', 'not-for-signing-in', 'evals')",
);
await db.close();
await import("../scripts/seed-expenses.mjs");

const files = readdirSync("knowledge")
  .filter((f) => f.endsWith(".md"))
  .map((source) => ({ source, markdown: readFileSync(`knowledge/${source}`, "utf8") }));
const again = await connect();
const { chunks } = await ingestGuides(again.query, files, embeddings());
const [{ trips }] = await again.query<{ trips: number }>("SELECT count(*)::int AS trips FROM trips");
await again.close();
console.log(`✓ Eval database ready in ${EVAL_DB}: ${trips} sample bookings, ${chunks.length} help sections.`);
