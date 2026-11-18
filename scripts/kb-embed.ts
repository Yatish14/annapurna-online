// Annapurna Assist, task 6.2: what an embedding is. Embeds one sentence with Gemini and prints the vector.
// Uses 1 embedding request (free tier).
//
//   npm run kb:embed
//   npm run kb:embed -- "Your own sentence"
import { DIMENSIONS, EMBEDDING_MODEL, GeminiEmbeddings } from "../lib/assistant/kb/embeddings";

if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const sentence = process.argv[2] ?? "How do I record a fuel entry for a booking?";
const started = Date.now();
const vector = await new GeminiEmbeddings({ taskType: "SEMANTIC_SIMILARITY" }).embedQuery(sentence);

console.log(`"${sentence}"\n→ ${EMBEDDING_MODEL}, ${Date.now() - started} ms\n`);
// The whole thing is just numbers: one list, always the same length, whatever the sentence's length
console.log(`${vector.length} numbers (we asked for ${DIMENSIONS}). The first 8:`);
console.log(vector.slice(0, 8).map((n) => n.toFixed(4)).join("  "));
// No single number means anything on its own ("number 3 = about fuel" isn't a thing); the meaning is in where
// the whole list points. Gemini scales every vector to length 1, so only the direction differs between texts.
console.log(`\nLength of the vector (√ of the sum of squares): ${Math.hypot(...vector).toFixed(4)}`);
console.log(`Smallest ${Math.min(...vector).toFixed(4)}, largest ${Math.max(...vector).toFixed(4)}`);
