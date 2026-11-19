// Annapurna Assist, task 8.11: does Gemini's caching work for us? Sends three different questions with the same
// system prompt and tools, and prints the input tokens Google reports as cached for each. Uses 3 requests (free tier).
//
//   npm run ai:cache
//
// Gemini caches by itself ("implicit caching"): when a request starts with the same tokens as a recent one, that
// start is read from the cache and billed at a tenth of the price (lib/assistant/prices.ts). It only works on the
// START of the request, which is why the prompt keeps its fixed rules first and the date and name last
// (lib/assistant/prompt.ts), and the tools' descriptions never change.
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MAIN_MODEL, mainModel } from "../lib/assistant/model";
import { systemPrompt } from "../lib/assistant/prompt";
import { TOOLS } from "../lib/assistant/tools";

if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const questions = ["Which bookings are coming up?", "Who still owes us money?", "How do I add a new driver?"];
const model = mainModel().bindTools(TOOLS);
console.log(`${MAIN_MODEL}, the same system prompt and ${TOOLS.length} tools each time:\n`);
console.log("Question                              Input   Cached   Share");
for (const q of questions) {
  const reply = await model.invoke([new SystemMessage(systemPrompt({ firstName: "Asha" })), new HumanMessage(q)]);
  const usage = reply.usage_metadata;
  const input = usage?.input_tokens ?? 0;
  const cached = usage?.input_token_details?.cache_read ?? 0;
  console.log(`${q.padEnd(36)} ${String(input).padStart(6)} ${String(cached).padStart(8)}   ${input ? Math.round((cached / input) * 100) : 0}%`);
}
console.log("\nCached input costs a tenth of fresh input on the paid tier. The first request has nothing cached yet.");
process.exit(0);
