// The eval runner (8.5): asks Annapurna Assist every question in evals/cases.jsonl and grades which tools it chose
// (evals/graders.ts), on the eval database (npm run eval:setup: sample data only, never Docker or Neon).
//
//   npm run eval                                      every case, with Flash-Lite (ASSISTANT_MODEL if set)
//   npm run eval -- --model gemini-3.8-flash --limit 10
//   npm run eval -- --tags money,drafts               only cases with these tags
//   npm run eval -- --model replay                    no Google at all: replays the answers recorded by the last real
//                                                     run (evals/recordings/), for CI (8.12)
//   npm run eval -- --privacy strict --leaks          privacy-first mode (Step 9), and the leak test (9.7): fails if
//                                                     any name, phone or amount from the database is in a request
//
// It runs the real graph, with the real tools on the eval database, so a question that needs two steps (the date,
// then the bookings) is graded on all its tool calls. The answers' words are saved too, for the AI judge (8.9).
// Each tool question uses 2–3 model requests; the runner waits as needed to stay under the free tier's per-minute limit.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { BaseMessage } from "@langchain/core/messages";

// ---------- Options ----------
const args = process.argv.slice(2);
const option = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const MODEL = option("model") ?? process.env.ASSISTANT_MODEL ?? "gemini-3.5-flash-lite";
const LIMIT = Number(option("limit") ?? Infinity);
const TAGS = option("tags")?.split(",");
const SKIP_TAGS = option("skip-tags")?.split(",");
const IDS = option("ids")?.split(",");
/** Requests a minute to stay under: the free tier allows 15 for Flash-Lite and 5 for 3.8 Flash; 10 leaves room, since a case counts its requests only when it ends */
const PER_MINUTE = MODEL === "replay" ? Infinity : MODEL.includes("lite") ? 10 : 4;
/** Privacy-first mode (Step 9) for this run, and the leak test (9.7) */
const STRICT = option("privacy") === "strict";
const LEAKS = args.includes("--leaks");
const LABEL = option("label") ?? `${MODEL}${STRICT ? "-strict" : ""}`;

// Before anything reads them: the eval database, and no real model calls when replaying
process.env.DATABASE_URL = "pglite:./.data/pglite-eval";
if (MODEL === "replay") process.env.ASSISTANT_FAKE = "1";
else process.env.ASSISTANT_MODEL = MODEL;
if (STRICT) process.env.ASSISTANT_PRIVACY = "strict";
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
const { bookingSoFar } = await import("../lib/assistant/history");
const { questionCostInr } = await import("../lib/assistant/prices");
const { UsageRecorder } = await import("../lib/assistant/requestLog");
const { findSecrets, loadSecrets, RequestRecorder } = await import("./leaks");
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
  .filter((c) => !SKIP_TAGS || !c.tags.some((t) => SKIP_TAGS.includes(t)))
  .filter((c) => !IDS || IDS.includes(c.id))
  .slice(0, LIMIT);

// ---------- Recordings: what each real run's model said, so CI can replay it for free ----------
// The day they were recorded too: "tomorrow" in a recorded answer is that day's tomorrow, so a replay on a later day
// grades dates and months as of the recording's day
const RECORDINGS = "evals/recordings/answers.json";
/**
 * recorded_on: the day of the run that recorded most cases. recorded_days: cases recorded on another day, by a run of
 * only some of them (--ids, --tags): "tomorrow" in a case recorded on the 19th is the 20th, whatever the others say.
 */
type Recording = { recorded_on: string; recorded_days?: Record<string, string>; passing?: string[]; cases: Record<string, Turn[]> };
const recording: Recording = (() => {
  try {
    return JSON.parse(readFileSync(RECORDINGS, "utf8"));
  } catch {
    return { recorded_on: todayIST(), cases: {} };
  }
})();
const recorded = recording.cases;
/** Only the app's own model's answers are recorded: CI replays those. A comparison run (8.10) leaves them alone. */
const RECORD = MODEL === "gemini-3.5-flash-lite" && !STRICT;
/** Cases that passed when recorded (earlier runs' too, unless run again now) */
const passingBefore = new Set(recording.passing ?? []);
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
const [admin] = await query<{ id: number; name: string }>("SELECT id::int, name FROM users WHERE mobile = '9000000099'");
if (!admin) {
  console.error("✗ The eval database isn't set up. Run npm run eval:setup first.");
  process.exit(1);
}
// The day a case's answers are graded as of: today, or the day its answers were recorded when replaying
const recordedDays = recording.recorded_days ?? {};
const dayOf = (id: string) => (MODEL === "replay" ? (recordedDays[id] ?? recording.recorded_on) : todayIST());

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
// Saved after every case, so a long run that's stopped (a closed terminal, Google's daily limit) loses nothing:
// `--resume` carries on from the cases already done, and tries again the ones that failed with an error (a 429)
const PARTIAL = `evals/results/.partial-${LABEL.replace(/[^a-z0-9.-]/gi, "_")}.json`;
const errored = (r: Result) => r.reasons.some((why) => why.startsWith("error:"));
const results: Result[] = (() => {
  if (!args.includes("--resume")) return [];
  try {
    return (JSON.parse(readFileSync(PARTIAL, "utf8")) as Result[]).filter((r) => !errored(r));
  } catch {
    return [];
  }
})();
const done = new Set(results.map((r) => r.id));
function saveProgress() {
  mkdirSync("evals/results", { recursive: true });
  writeFileSync(PARTIAL, JSON.stringify(results));
  if (RECORD) {
    mkdirSync("evals/recordings", { recursive: true });
    // Which cases passed when recorded: a replay (CI) fails only if one of these fails now, a regression
    const passing = new Set(passingBefore);
    for (const r of results) r.pass ? passing.add(r.id) : passing.delete(r.id);
    // Each case's own day; the most common one is recorded_on, and only the others are listed
    const count = new Map<string, number>();
    for (const id of Object.keys(recorded)) {
      const day = recordedDays[id] ?? recording.recorded_on;
      count.set(day, (count.get(day) ?? 0) + 1);
    }
    const usual = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? todayIST();
    const others = Object.fromEntries(
      Object.keys(recorded)
        .sort()
        .map((id) => [id, recordedDays[id] ?? recording.recorded_on] as const)
        .filter(([, day]) => day !== usual),
    );
    writeFileSync(
      RECORDINGS,
      `${JSON.stringify({ recorded_on: usual, ...(Object.keys(others).length ? { recorded_days: others } : {}), passing: [...passing].sort(), cases: recorded }, null, 2)}\n`,
    );
  }
}
/** What our server put in each case's requests (system prompts, tool results), for the leak test */
const sentByCase = new Map<string, string[]>();
const turnsOf = (messages: BaseMessage[]): Turn[] =>
  messages
    .filter((m) => AIMessage.isInstance(m))
    .map((m) => ({ text: m.text, toolCalls: ((m as InstanceType<typeof AIMessage>).tool_calls ?? []).map((c) => ({ name: c.name, args: c.args })) }));

console.log(`${cases.length} cases with ${MODEL}${MODEL === "replay" ? " (recorded answers, no Google)" : ""}, on the eval database\n`);
if (done.size) console.log(`Resuming: ${done.size} cases already done\n`);
for (const c of cases) {
  if (done.has(c.id)) continue;
  const recorder = new UsageRecorder();
  // Every request the model would get, for the leak test (9.7)
  const requests = new RequestRecorder();
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
          : await isOnTopic(c.question, undefined, new AbortController().signal, [recorder, requests]);
      // The check lets a question through when it fails (guard.ts), so a 429 or a timeout would look like "ALLOW".
      // No finished call means it never answered: an error to try again (--resume), not a verdict to grade.
      if (MODEL !== "replay" && !recorder.calls.length) throw new Error("the off-topic check got no answer (over the limit, or too slow)");
      turns = [{ text: allowed ? "ALLOW" : "BLOCK", toolCalls: [] }];
      grade = gradeGuard(c.expect.guard, allowed);
    } else {
      await makeRoom(3);
      started = Date.now();
      // A follow-up case's earlier turns: their texts for the model, and the unfinished booking for draft_booking,
      // worked out by the app's own code (lib/assistant/history.ts)
      const earlier = c.history ?? [];
      const input = [
        // The eval admin's real first name from the database, as the app sends it: the leak test checks it's left
        // out in privacy-first mode (9.3)
        new SystemMessage(systemPrompt({ firstName: admin.name.split(" ")[0] })),
        ...earlier.map((t) => (t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text))),
        new HumanMessage(c.question),
      ];
      const soFar = bookingSoFar(earlier.map((t) => ({ role: t.role, text: t.text, error: null, cards: null, toolCalls: t.tool_calls })));
      const out = await graph.invoke(
        { messages: input },
        { configurable: { userId: admin.id, bookingSoFar: soFar }, callbacks: [recorder, requests], recursionLimit: RECURSION_LIMIT },
      );
      // Only this question's turns: the earlier ones were given, not answered
      turns = turnsOf(out.messages.slice(input.length));
      for (const _ of turns) sentAt.push(Date.now());
      calls = turns.flatMap((t) => t.toolCalls);
      answer = turns.at(-1)?.text ?? "";
      grade = gradeCase(c.expect, calls, answer, dayOf(c.id));
    }
    if (RECORD) {
      recorded[c.id] = turns;
      recordedDays[c.id] = todayIST();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Google's 429 says which limit in a line further down ("Quota exceeded for metric: …per day…"): keep that line
    const metric = /Quota exceeded for metric: [^\n]*/.exec(message)?.[0];
    grade = { pass: false, toolsRight: false, reasons: [`error: ${metric ?? message.slice(0, 200)}`] };
    // Over the per-minute limit anyway: wait a minute before the next case
    if (/429|quota/i.test(message)) await wait(60_000);
  }
  const used = recorder.calls;
  sentByCase.set(c.id, requests.sent);
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
    inr: questionCostInr(used, dayOf(c.id)).inr,
  });
  const r = results.at(-1)!;
  console.log(
    `${r.pass ? "✓" : r.toolsRight ? "~" : "✗"} ${c.id.padEnd(22)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${calls.map((x) => x.name).join(", ") || (c.expect.guard ? turns[0]?.text : "no tool")}${r.reasons.length ? `\n    ${r.reasons.join("\n    ")}` : ""}`,
  );
  saveProgress();
}

// ---------- The leak test (9.7) ----------
const leaks: { id: string; found: string[] }[] = [];
if (LEAKS) {
  const secrets = await loadSecrets(query);
  for (const [id, sent] of sentByCase) {
    const found = [...new Set(sent.flatMap((text) => findSecrets(text, secrets)))];
    if (found.length) leaks.push({ id, found });
  }
  console.log(
    `\nLeak test: ${sentByCase.size} cases, ${[...sentByCase.values()].flat().length} system prompts and tool results checked for ` +
      `${secrets.names.length} names, ${secrets.phones.length} phones, ${secrets.amounts.length} amounts from the database.`,
  );
  if (leaks.length) {
    console.log(`✗ Found in ${leaks.length} cases:`);
    for (const l of leaks.slice(0, 20)) console.log(`    ${l.id}: ${l.found.slice(0, 6).join(", ")}${l.found.length > 6 ? "…" : ""}`);
  } else console.log("✓ None found: nothing from the database reached the model.");
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
  privacy: STRICT ? "strict" : "normal",
  ...(LEAKS && { leaks }),
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
rmSync(PARTIAL, { force: true }); // finished: the next run starts afresh
// A real run with failures isn't a crash: it's what the report is for. A replay (CI) fails only on a regression: a
// case that passed when it was recorded and fails now (a tool, a grader or a case was broken since)
const regressions = MODEL === "replay" ? results.filter((r) => !r.pass && passingBefore.has(r.id)) : [];
if (regressions.length) console.error(`✗ ${regressions.length} case(s) passed when recorded and fail now: ${regressions.map((r) => r.id).join(", ")}`);
// The leak test fails the run if anything was found (it's what CI runs in strict mode)
process.exit(regressions.length || (LEAKS && leaks.length) ? 1 : 0);
