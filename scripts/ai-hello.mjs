// Annapurna Assist, task 0.4: the smallest model call. Asks Gemini one question and prints the reply
// and how many tokens it used. Uses 1 of the free tier's 500 requests a day.
//
//   npm run ai:hello
//   npm run ai:hello -- "Your own question"
import { ChatGoogle } from "@langchain/google/node";

if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const model = new ChatGoogle({
  model: "gemini-3.5-flash-lite", // free tier: 15 requests a minute, 500 a day
  temperature: 0.2, // low: nearly the same answer each time
  maxOutputTokens: 300, // a cap on the answer's length
});

const question = process.argv[2] ?? "In two sentences, what does a car rental business in Vijayawada do?";
console.log(`You: ${question}\n`);

const started = Date.now();
const reply = await model.invoke(question);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`Gemini: ${reply.text}\n`);
const usage = reply.usage_metadata;
console.log(`Tokens: ${usage?.input_tokens} in, ${usage?.output_tokens} out, ${usage?.total_tokens} total · ${seconds}s`);
