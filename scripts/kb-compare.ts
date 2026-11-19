// Annapurna Assist, task 6.3: the intuition behind vector search. Embeds a few sentences and prints how alike each
// pair is (cosine similarity), next to how many words they share. Uses 1 embedding request (free tier).
//
//   npm run kb:compare
//   npm run kb:compare -- "sentence one" "sentence two" "sentence three"
import { cosineSimilarity, fakeEmbedding, GeminiEmbeddings } from "../lib/assistant/kb/embeddings";

if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

// The default three: 1 and 2 mean nearly the same with almost no words in common; 1 and 3 share words
// ("fuel", "booking") but mean different things; 4 is about nothing here, to show what "unrelated" scores
const sentences = process.argv.length > 3
  ? process.argv.slice(2)
  : [
      "How do I add diesel for a trip?",
      "Recording a fuel entry on a booking",
      "Who pays for the booking when the fuel price goes up?",
      "What will the weather be like in Hyderabad tomorrow?",
    ];

// One request for all of them (embedDocuments batches them). SEMANTIC_SIMILARITY: we're comparing like with like,
// not questions with answers.
const vectors = await new GeminiEmbeddings({ taskType: "SEMANTIC_SIMILARITY" }).embedDocuments(sentences);

sentences.forEach((s, i) => console.log(`${i + 1}. ${s}`));
console.log("\nPair    Gemini (meaning)   Shared words (the test fake)");
for (let i = 0; i < sentences.length; i++) {
  for (let j = i + 1; j < sentences.length; j++) {
    const meaning = cosineSimilarity(vectors[i], vectors[j]);
    // The fake (lib/assistant/kb/embeddings.ts) only counts shared words: what keyword search would see
    const words = cosineSimilarity(fakeEmbedding(sentences[i]), fakeEmbedding(sentences[j]));
    console.log(`${i + 1} – ${j + 1}   ${meaning.toFixed(3).padStart(8)}           ${words.toFixed(3).padStart(8)}`);
  }
}
// Real embeddings rarely go near 0 for two sentences in the same language: what matters is the order (which pair
// is closest), not the number itself. That's why search takes the closest few instead of using a fixed cut-off.
console.log("\n1 = same direction (same meaning). Vector search sorts the guides by this number and takes the closest few.");
