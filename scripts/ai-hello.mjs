// Annapurna Assist, tasks 0.4–0.6: the smallest model call. Sends Gemini our rules (a system message) and
// one question, then prints the reply word by word as it arrives,
// with how many tokens it used and how long it took. Uses 1 of the free tier's 500 requests a day.
//
//   npm run ai:hello
//   npm run ai:hello -- "Your own question"
import { ChatGoogle } from "@langchain/google/node";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const model = new ChatGoogle({
  model: "gemini-3.5-flash-lite", // free tier: 15 requests a minute, 500 a day
  temperature: 0.2, // low: nearly the same answer each time
  maxOutputTokens: 300, // a cap on the answer's length
});

// Our rules. Sent before every question; the admin never sees them. (The real one comes in lib/assistant/prompt.ts.)
const rules = `You are Annapurna Assist, the helper inside the admin dashboard of Annapurna Online Services
(printouts and online services) and Annapurna Tours & Travels (car rentals: Kia Carens and Kia Seltos).
- Only help with this business: bookings, payments, drivers, vehicles, fuel, printouts, reports, and using the dashboard.
- For anything else, say politely in one sentence that you only help with the business.
- Reply in the language the question is written in (English, Telugu or Hindi).
- Keep it short: at most 3 sentences.
- You can't see the business's data yet, so never make up numbers or names.`;

const question = process.argv[2] ?? "Who are you, and what can you help me with?";
console.log(`You: ${question}\n`);

const started = Date.now();
let firstWordAt = 0;
let reply; // all the pieces joined together, so the token counts are complete at the end

// stream: the answer arrives in small pieces ("chunks") while Gemini is still writing it
process.stdout.write("Gemini: ");
for await (const chunk of await model.stream([new SystemMessage(rules), new HumanMessage(question)])) {
  if (!firstWordAt && chunk.text) firstWordAt = Date.now();
  process.stdout.write(chunk.text); // print this piece now, on the same line, without waiting for the rest
  reply = reply ? reply.concat(chunk) : chunk;
}

const seconds = (ms) => (ms / 1000).toFixed(1);
const usage = reply?.usage_metadata;
console.log(`\n\nTokens: ${usage?.input_tokens} in, ${usage?.output_tokens} out, ${usage?.total_tokens} total`);
console.log(`Time: first words after ${seconds(firstWordAt - started)}s, whole answer after ${seconds(Date.now() - started)}s`);
