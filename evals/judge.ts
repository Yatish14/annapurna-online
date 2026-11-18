// The AI judge (8.9): Flash-Lite scores the assistant's answers on a few cases, where code can't (is it right, is it
// grounded in what the tools found, is it in the right language and style?).
//
//   npm run eval:judge                     the answers of the last real eval run (evals/results/tools-*.json)
//
// For each case the tools are run again from the recording (free: the replayed model, the eval database), so the judge
// sees exactly what the model saw. Two answers are spoiled on purpose (a made-up amount, the wrong language), to check
// the judge catches them: a judge needs testing too. Uses one Flash-Lite request per answer (free tier).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

process.env.DATABASE_URL = "pglite:./.data/pglite-eval";
// Not the fake models: the replay stands in for the main model, and the help search must embed questions with the
// same model as the guides in the eval database (fake question vectors against Gemini guide vectors find nothing)
process.env.ASSISTANT_PRIVACY = "";
if (!process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local.");
  process.exit(1);
}

const { ChatGoogle } = await import("@langchain/google/node");
const { HumanMessage, SystemMessage, ToolMessage } = await import("@langchain/core/messages");
const { buildGraph, MAX_TOOL_ROUNDS, RECURSION_LIMIT } = await import("../lib/assistant/graph");
const { MODELS } = await import("../lib/assistant/model");
const { systemPrompt } = await import("../lib/assistant/prompt");
const { query } = await import("../lib/db");
const { ReplayModel } = await import("./replay");

/** Cases with answers worth judging: facts from tools, a help answer, a draft, and the two other languages */
const IDS = ["upcoming", "owed", "profit-last-month", "open-number", "find-customer", "help-add-driver", "help-cash-profit", "customer-paid", "te-profit", "hi-money-in", "injected-notes", "owes-not-help"];

const report = JSON.parse(readFileSync(`evals/results/tools-${MODELS.flashLite}.json`, "utf8")) as {
  model: string;
  results: { id: string; question: string; answer: string }[];
};
const recording = JSON.parse(readFileSync("evals/recordings/answers.json", "utf8")) as { cases: Record<string, import("./replay").Turn[]> };

const RUBRIC = `You grade answers given by Annapurna Assist, an assistant in a car-rental and printout business's admin dashboard.
You get the admin's question, the tool results the assistant had (its only source of facts), and its answer.
Score each from 1 (bad) to 5 (good):
- correct: every name, number, date and claim in the answer matches the tool results. Anything not in them is made up: score 1 or 2.
- complete: it answers what was asked (it may point to a table or PDF shown under the answer for the details).
- style: same language as the question (English, Telugu or Hindi), short and plain, no links, money like ₹1,25,000.
Reply with JSON only: {"correct": n, "complete": n, "style": n, "verdict": "good" or "bad", "why": "one short sentence"}.
"bad" if any score is 1 or 2.`;

const judge = new ChatGoogle({ model: MODELS.flashLite, temperature: 0, maxOutputTokens: 600, maxRetries: 2 });
const replay = new ReplayModel();
const graph = buildGraph(MAX_TOOL_ROUNDS, undefined, () => replay);
const [admin] = await query<{ id: number }>("SELECT id::int FROM users WHERE mobile = '9000000099'");

type Item = { id: string; question: string; answer: string; spoiled?: string };
const items: Item[] = IDS.map((id) => report.results.find((r) => r.id === id)!).filter(Boolean);
// The judge's own test: two answers made worse on purpose. A judge that passes these isn't worth its scores.
const owed = items.find((i) => i.id === "owed")!;
items.push({ ...owed, id: "spoiled-amount", answer: `${owed.answer} In total customers owe ₹9,87,654.`, spoiled: "a made-up amount" });
const te = items.find((i) => i.id === "te-profit")!;
items.push({ ...te, id: "spoiled-language", answer: "This month's profit report is ready below.", spoiled: "English for a Telugu question" });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const verdicts: (Item & { scores: Record<string, unknown> })[] = [];
for (const item of items) {
  const baseId = item.id.startsWith("spoiled-") ? (item.id === "spoiled-amount" ? "owed" : "te-profit") : item.id;
  // What the tools returned, from the recorded calls run again on the eval database
  replay.load(recording.cases[baseId]);
  const out = await graph.invoke(
    { messages: [new SystemMessage(systemPrompt({ firstName: "Asha" })), new HumanMessage(item.question)] },
    { configurable: { userId: admin.id }, recursionLimit: RECURSION_LIMIT },
  );
  const results = out.messages.filter((m) => ToolMessage.isInstance(m)).map((m) => `${(m as InstanceType<typeof ToolMessage>).name}: ${m.text.slice(0, 3000)}`);
  const reply = await judge.invoke([
    new SystemMessage(RUBRIC),
    new HumanMessage(`<question>${item.question}</question>\n<tool_results>\n${results.join("\n") || "(none)"}\n</tool_results>\n<answer>${item.answer}</answer>`),
  ]);
  const json = /\{[\s\S]*\}/.exec(reply.text)?.[0];
  const scores = json ? (JSON.parse(json) as Record<string, unknown>) : { verdict: "unreadable", why: reply.text.slice(0, 120) };
  verdicts.push({ ...item, scores });
  console.log(`${scores.verdict === "good" ? "✓" : "✗"} ${item.id.padEnd(18)} correct ${scores.correct} · complete ${scores.complete} · style ${scores.style}  ${scores.why ?? ""}${item.spoiled ? `  [spoiled: ${item.spoiled}]` : ""}`);
  await wait(6500); // under 10 requests a minute
}

const real = verdicts.filter((v) => !v.spoiled);
const caught = verdicts.filter((v) => v.spoiled && v.scores.verdict === "bad").length;
console.log(`\n${real.filter((v) => v.scores.verdict === "good").length}/${real.length} answers judged good; the judge caught ${caught}/2 spoiled answers.`);
mkdirSync("evals/results", { recursive: true });
writeFileSync("evals/results/judge.json", `${JSON.stringify({ ran: new Date().toISOString(), judge: MODELS.flashLite, answers_from: report.model, verdicts }, null, 2)}\n`);
console.log("Saved to evals/results/judge.json");
process.exit(0);
