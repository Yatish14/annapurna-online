import { resolveMonth } from "@/lib/assistant/months";
import { addDays, todayIST } from "@/lib/dates";

/**
 * Code graders for the evals (8.6): did the model pick the right tools, with the right inputs? Plain code, so they
 * are free, instant and always give the same verdict (unlike a model judging, 8.9).
 *
 * A case in evals/cases.jsonl says what to expect:
 *   "tools":   [{ "name": "list_bookings", "args": { "status": "upcoming" } }]  each must be called (any order;
 *              other calls are allowed); "name" can be a list of acceptable tools
 *   "noTools": true             no tool at all (e.g. "who are you?", or a question the model should ask back)
 *   "forbid":  ["draft_booking"] these must not be called (e.g. a prompt injection asking to change data)
 *   "guard":   "block" | "allow" the off-topic check's verdict (these cases run only the check)
 *   "answer":  { "includes": [...], "excludes": [...] }  words the final answer must (not) have, any case
 *
 * Expected inputs ("args") match like this:
 *   "upcoming", 3000, true      the same value (text ignores case and spaces at the ends)
 *   { "$contains": "ravi" }     text containing this
 *   { "$month": "last month" }  any input that means the same month ("2026-10", "October", "last month"…)
 *   { "$date": 1 }              the date that many days from today (1 = tomorrow)
 *   { "$oneOf": ["a", "b"] }    any of these
 *   { "$any": true }            given, any value
 *   { "$absent": true }         not given (or empty)
 */

export type Matcher =
  | string
  | number
  | boolean
  | { $contains: string }
  | { $month: string }
  | { $date: number }
  | { $oneOf: (string | number | boolean)[] }
  | { $any: true }
  | { $absent: true };

export type ExpectedCall = { name: string | string[]; args?: Record<string, Matcher> };

export type Expect = {
  tools?: ExpectedCall[];
  noTools?: boolean;
  forbid?: string[];
  guard?: "block" | "allow";
  answer?: { includes?: string[]; excludes?: string[] };
};

/** An earlier turn of the chat, as the app would have saved it: the model sees the texts, draft_booking the calls */
export type EarlierTurn = { role: "user" | "assistant"; text: string; tool_calls?: Call[] };

/** "history": earlier turns, for a follow-up question (the app's history.ts passes the same from the saved chat) */
export type Case = { id: string; question: string; tags: string[]; expect: Expect; history?: EarlierTurn[] };

export type Call = { name: string; args: Record<string, unknown> };

export type Grade = {
  pass: boolean;
  /** The right tools were called (names only), whatever their inputs: tells "wrong tool" from "right tool, wrong input" */
  toolsRight: boolean;
  /** Why it failed, in words (empty when it passed) */
  reasons: string[];
};

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const empty = (v: unknown) => v === undefined || v === null || v === "";

/** Does one input match its expectation? */
export function matches(actual: unknown, expected: Matcher, today = todayIST()): boolean {
  if (typeof expected !== "object") return norm(actual) === norm(expected);
  if ("$any" in expected) return !empty(actual);
  if ("$absent" in expected) return empty(actual);
  if ("$contains" in expected) return typeof actual === "string" && actual.toLowerCase().includes(expected.$contains.toLowerCase());
  if ("$oneOf" in expected) return expected.$oneOf.some((e) => norm(actual) === norm(e));
  if ("$month" in expected) {
    const want = resolveMonth(expected.$month, today);
    // Left out means this month: every month tool defaults to it
    if (empty(actual)) return want !== null && want === resolveMonth("this month", today);
    return typeof actual === "string" && want !== null && resolveMonth(actual, today) === want;
  }
  if ("$date" in expected) return actual === addDays(today, expected.$date);
  return false;
}

const names = (n: string | string[]) => (Array.isArray(n) ? n : [n]);

/** Grades one case's tool calls (and final answer, if the case says what it must or mustn't say) */
export function gradeCase(expect: Expect, calls: Call[], answer = "", today = todayIST()): Grade {
  const reasons: string[] = [];
  let toolsRight = true;
  const called = calls.map((c) => c.name);

  for (const want of expect.tools ?? []) {
    const sameTool = calls.filter((c) => names(want.name).includes(c.name));
    if (!sameTool.length) {
      toolsRight = false;
      reasons.push(`expected ${names(want.name).join(" or ")}, got ${called.length ? called.join(", ") : "no tool"}`);
      continue;
    }
    // Any one call of the right tool with all the right inputs will do (a model may try twice)
    const wrong = (c: Call) => Object.entries(want.args ?? {}).filter(([k, m]) => !matches(c.args[k], m, today));
    if (!sameTool.some((c) => wrong(c).length === 0)) {
      const best = sameTool.reduce((a, b) => (wrong(a).length <= wrong(b).length ? a : b));
      for (const [k, m] of wrong(best)) reasons.push(`${best.name}.${k}: expected ${JSON.stringify(m)}, got ${JSON.stringify(best.args[k])}`);
    }
  }
  if (expect.noTools && calls.length) {
    toolsRight = false;
    reasons.push(`expected no tool, got ${called.join(", ")}`);
  }
  for (const banned of expect.forbid ?? []) {
    if (called.includes(banned)) {
      toolsRight = false;
      reasons.push(`must not call ${banned}`);
    }
  }
  const text = answer.toLowerCase();
  for (const w of expect.answer?.includes ?? []) if (!text.includes(w.toLowerCase())) reasons.push(`answer should mention "${w}"`);
  for (const w of expect.answer?.excludes ?? []) if (text.includes(w.toLowerCase())) reasons.push(`answer must not say "${w}"`);

  return { pass: reasons.length === 0, toolsRight, reasons };
}

/** The off-topic check's cases: blocked or allowed, as expected? */
export function gradeGuard(expected: "block" | "allow", allowed: boolean): Grade {
  const right = (expected === "allow") === allowed;
  return { pass: right, toolsRight: right, reasons: right ? [] : [`the off-topic check should ${expected} it`] };
}
