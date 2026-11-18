// The eval runner (8.5): asks Annapurna Assist every question in evals/cases.jsonl and grades which tools it chose
// (evals/graders.ts), on the eval database (npm run eval:setup: sample data only, never Docker or Neon).
//
//   npm run eval                                      every case, with Flash-Lite (ASSISTANT_MODEL if set)
//   npm run eval -- --model gemini-3.8-flash --limit 10
//   npm run eval -- --tags money,drafts               only cases with these tags
//   npm run eval -- --model replay                    no Google at all: replays the answers recorded by the last real
//                                                     run (evals/recordings/), for CI (8.12)
//
// It runs the real graph, with the real tools on the eval database, so a question that needs two steps (the date,
// then the bookings) is graded on all its tool calls. The answers' words are saved too, for the AI judge (8.9).
// Each tool question uses 2–3 model requests; the runner waits as needed to stay under the free tier's per-minute limit.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { BaseMessage } from "@langchain/core/messages";

// ---------- Options ----------
const args = process.argv.slice(2);
const option = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const MODEL = option("model") ?? process.env.ASSISTANT_MODEL ?? "gemini-3.5-flash-lite";
const LIMIT = Number(option("limit") ?? Infinity);
const TAGS = option("tags")?.split(",");
const IDS = option("ids")?.split(",");
/** Requests a minute to stay under: the free tier allows 15 for Flash-Lite and 5 for 3.8 Flash */
const PER_MINUTE = MODEL === "replay" ? Infinity : MODEL.includes("lite") ? 13 : 4;
const LABEL = option("label") ?? MODEL;

// Before anything reads them: the eval database, and no real model calls when replaying
process.env.DATABASE_URL = "pglite:./.data/pglite-eval";
if (MODEL === "replay") process.env.ASSISTANT_FAKE = "1";
else process.env.ASSISTANT_MODEL = MODEL;
if (MODEL !== "replay" && !process.env.GOOGLE_API_KEY) {
  console.error("✗ GOOGLE_API_KEY is missing. Add it to .env.local, or use --model replay.");
  process.exit(1);
}

const { AIMessage, HumanMessage, SystemMessage } = await import("@langchain/core/messages");
const { query } = await import("../lib/db");
const { buildGraph, MAX_TOOL_ROUNDS, RECURSION_LIMIT } = await import("../lib/assistant/graph");
const { isOnTopic } = await import("../lib/assistant/guard");
const { mainModel } = await import("../lib/assistant/model");
const { systemPrompt } = await import("../lib/assistant/prompt");
const { questionCostInr } = await import("../lib/assistant/prices");
const { UsageRecorder } = await import("../lib/assistant/requestLog");
const { todayIST } = await import("../lib/dates");
const { gradeCase, gradeGuard } = await import("./graders");
const { ReplayModel } = await import("./replay");
type Case = import("./graders").Case;
type Call = import("./graders").Call;
type Turn = import("./replay").Turn;

// ---------- Cases ----------
const all: Case[] = readFileSync("evals/cases.jsonl", "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const cases = all
  .filter((c) => !TAGS || c.tags.some((t) => TAGS.includes(t)))
  .filter((c) => !IDS || IDS.includes(c.id))
  .slice(0, LIMIT);

// ---------- Recordings: what each real run's model said, so CI can replay it for free ----------
const RECORDINGS = "evals/recordings/answers.json";
type Recording = Record<string, Turn[]>;
const recorded: Recording = (() => {
  try {
    return JSON.parse(readFileSync(RECORDINGS, "utf8"));
  } catch {
    return {};
  }
})();
const replay = new ReplayModel();
const graph = buildGraph(MAX_TOOL_ROUNDS, undefined, MODEL === "replay" ? () => replay : mainModel);

// ---------- Pacing for the free tier: requests in the last minute ----------
const sentAt: number[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function makeRoom(requests: number) {
  if (PER_MINUTE === Infinity) return;
  for (;;) {
    while (sentAt.length && sentAt[0] < Date.now() - 60_000) sentAt.shift();
    if (sentAt.length + requests <= PER_MINUTE) return;
    await wait(sentAt[0] + 60_000 - Date.now() + 200);
  }
}

// The admin the drafts belong to (evals/setup.ts)
const [admin] = await query<{ id: number }>("SELECT id::int FROM users WHERE mobile = '9000000099'");
if (!admin) {
  console.error("✗ The eval database isn't set up. Run npm run eval:setup first.");
  process.exit(1);
}
const today = todayIST();

type Result = {
  id: string;
  tags: string[];
  question: string;
  pass: boolean;
  toolsRight: boolean;
  reasons: string[];
  calls: Call[];
  answer: string;
  ms: number;
  requests: number;
  input: number;
  output: number;
  cached: number;
  inr: number;
};
const results: Result[] = [];
const turnsOf = (messages: BaseMessage[]): Turn[] =>
  messages
    .filter((m) => AIMessage.isInstance(m))
    .map((m) => ({ text: m.text, toolCalls: ((m as InstanceType<typeof AIMessage>).tool_calls ?? []).map((c) => ({ name: c.name, args: c.args })) }));

console.log(`${cases.length} cases with ${MODEL}${MODEL === "replay" ? " (recorded answers, no Google)" : ""}, on the eval database\n`);
for (const c of cases) {
  const recorder = new UsageRecorder();
  // Timed from after the wait for the per-minute limit: the time an admin would wait, not the runner's pacing
  let started = Date.now();
  let calls: Call[] = [];
  let answer = "";
  let grade;
  let turns: Turn[] = [];
  try {
    if (MODEL === "replay") {
      if (!recorded[c.id]) throw new Error("no recording for this case (run it with a real model first)");
      replay.load(recorded[c.id]);
    }
    if (c.expect.guard) {
      await makeRoom(1);
      started = Date.now();
      sentAt.push(Date.now());
      // The off-topic check alone: these cases never reach the main model
      const allowed =
        MODEL === "replay"
          ? recorded[c.id][0].text === "ALLOW"
          : await isOnTopic(c.question, undefined, new AbortController().signal, [recorder]);
      turns = [{ text: allowed ? "ALLOW" : "BLOCK", toolCalls: [] }];
      grade = gradeGuard(c.expect.guard, allowed);
    } else {
      await makeRoom(3);
      started = Date.now();
      const out = await graph.invoke(
        { messages: [new SystemMessage(systemPrompt({ firstName: "Asha" })), new HumanMessage(c.question)] },
        { configurable: { userId: admin.id }, callbacks: [recorder], recursionLimit: RECURSION_LIMIT },
      );
      turns = turnsOf(out.messages);
      for (const _ of turns) sentAt.push(Date.now());
      calls = turns.flatMap((t) => t.toolCalls);
      answer = turns.at(-1)?.text ?? "";
      grade = gradeCase(c.expect, calls, answer, today);
    }
    if (MODEL !== "replay") recorded[c.id] = turns;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    grade = { pass: false, toolsRight: false, reasons: [`error: ${message.slice(0, 200)}`] };
    // Over the per-minute limit anyway: wait a minute before the next case
    if (/429|quota/i.test(message)) await wait(60_000);
  }
  const used = recorder.calls;
  results.push({
    id: c.id,
    tags: c.tags,
    question: c.question,
    ...grade,
    calls,
    answer,
    ms: Date.now() - started,
    requests: used.length,
    input: used.reduce((n, u) => n + u.input, 0),
    output: used.reduce((n, u) => n + u.output, 0),
    cached: used.reduce((n, u) => n + u.cached, 0),
    inr: questionCostInr(used, today).inr,
  });
  const r = results.at(-1)!;
  console.log(
    `${r.pass ? "✓" : r.toolsRight ? "~" : "✗"} ${c.id.padEnd(22)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${calls.map((x) => x.name).join(", ") || (c.expect.guard ? turns[0]?.text : "no tool")}${r.reasons.length ? `\n    ${r.reasons.join("\n    ")}` : ""}`,
  );
}

// ---------- Report (8.7) ----------
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
const passed = results.filter((r) => r.pass).length;
const toolsRight = results.filter((r) => r.toolsRight).length;
const byTag: Record<string, { cases: number; passed: number }> = {};
for (const r of results) {
  for (const t of r.tags) {
    byTag[t] ??= { cases: 0, passed: 0 };
    byTag[t].cases++;
    if (r.pass) byTag[t].passed++;
  }
}
const sum = (k: "ms" | "requests" | "input" | "output" | "cached" | "inr") => results.reduce((n, r) => n + r[k], 0);
const report = {
  ran: new Date().toISOString(),
  model: MODEL,
  cases: results.length,
  passed,
  accuracy: results.length ? passed / results.length : 0,
  tools_right: results.length ? toolsRight / results.length : 0,
  by_tag: Object.fromEntries(Object.entries(byTag).map(([t, v]) => [t, { ...v, accuracy: v.passed / v.cases }])),
  average_seconds: results.length ? Number((sum("ms") / results.length / 1000).toFixed(2)) : 0,
  requests: sum("requests"),
  tokens: { input: sum("input"), output: sum("output"), cached: sum("cached") },
  would_cost_inr: Number(sum("inr").toFixed(4)),
  failures: results.filter((r) => !r.pass).map(({ id, question, reasons, calls }) => ({ id, question, reasons, calls })),
  results,
};

console.log(`\n${passed}/${results.length} passed (${pct(passed, results.length)}); right tools ${pct(toolsRight, results.length)}`);
console.log(Object.entries(byTag).map(([t, v]) => `${t} ${v.passed}/${v.cases}`).join(" · "));
console.log(
  `${report.average_seconds} s a case · ${report.requests} model requests · ${report.tokens.input.toLocaleString("en-IN")} tokens in ` +
    `(${pct(report.tokens.cached, report.tokens.input)} cached), ${report.tokens.output.toLocaleString("en-IN")} out · ` +
    `would cost ₹${report.would_cost_inr.toFixed(2)} on the paid tier`,
);

mkdirSync("evals/results", { recursive: true });
const file = `evals/results/tools-${LABEL.replace(/[^a-z0-9.-]/gi, "_")}.json`;
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Saved to ${file}`);
if (MODEL !== "replay") {
  mkdirSync("evals/recordings", { recursive: true });
  writeFileSync(RECORDINGS, `${JSON.stringify(recorded, null, 2)}\n`);
}
// Fewer than all passing isn't a crash: only replay (CI) fails the run, since a recorded answer must keep passing
process.exit(MODEL === "replay" && passed < results.length ? 1 : 0);
