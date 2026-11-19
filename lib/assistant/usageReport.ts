import { query } from "@/lib/db";
import { questionCostInr } from "./prices";
import type { ModelCall, Outcome } from "./requestLog";

/**
 * The numbers on the usage page (8.3), from assistant_requests (8.1) and the price table (8.2). Server only.
 * The rows are read once and added up here, not in SQL, because each call is priced by its own model and day.
 */

export const DAYS = 30;

type Row = {
  id: number;
  name: string;
  day: string;
  time: string;
  outcome: Outcome;
  model: string;
  calls: ModelCall[];
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  tools: string[];
  first_text_ms: number | null;
  total_ms: number;
};

export type Totals = {
  questions: number;
  calls: number;
  input: number;
  output: number;
  cached: number;
  /** Would cost on the paid tier, in rupees */
  inr: number;
  /** Some calls were by a model the price table doesn't have */
  incomplete: boolean;
  /** Averages over answered questions, in ms */
  firstText: number | null;
  total: number | null;
  offTopic: number;
  failed: number;
  stopped: number;
};

export type Request = Row & { inr: number };

export type UsageReport = {
  totals: Totals;
  today: Totals;
  byDay: (Totals & { day: string })[];
  byAdmin: (Totals & { name: string })[];
  /** Where the tokens go: the answer's calls, the off-topic check, the titles */
  byPurpose: { purpose: string; calls: number; input: number; output: number; inr: number }[];
  recent: Request[];
};

function totalsOf(rows: Request[]): Totals {
  const answered = rows.filter((r) => r.outcome === "answered");
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    questions: rows.length,
    calls: rows.reduce((n, r) => n + r.calls.length, 0),
    input: rows.reduce((n, r) => n + r.input_tokens, 0),
    output: rows.reduce((n, r) => n + r.output_tokens, 0),
    cached: rows.reduce((n, r) => n + r.cached_tokens, 0),
    inr: rows.reduce((n, r) => n + r.inr, 0),
    incomplete: rows.some((r) => !questionCostInr(r.calls, r.day).complete),
    firstText: avg(answered.flatMap((r) => (r.first_text_ms === null ? [] : [r.first_text_ms]))),
    total: avg(answered.map((r) => r.total_ms)),
    offTopic: rows.filter((r) => r.outcome === "off_topic").length,
    failed: rows.filter((r) => r.outcome === "failed").length,
    stopped: rows.filter((r) => r.outcome === "stopped").length,
  };
}

/** Groups rows by a key, keeping the order keys first appear in (rows are newest first) */
function groupBy<K extends string>(rows: Request[], key: (r: Request) => K): [K, Request[]][] {
  const groups = new Map<K, Request[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups];
}

export async function usageReport(today: string): Promise<UsageReport> {
  const rows = await query<Row>(
    `SELECT r.id::int, u.name,
            to_char(r.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
            to_char(r.created_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS time,
            r.outcome, r.model, r.calls, r.input_tokens, r.output_tokens, r.cached_tokens, r.tools, r.first_text_ms, r.total_ms
     FROM assistant_requests r JOIN users u ON u.id = r.user_id
     WHERE r.created_at > now() - make_interval(days => $1)
     ORDER BY r.created_at DESC, r.id DESC`,
    [DAYS],
  );
  const priced: Request[] = rows.map((r) => ({ ...r, inr: questionCostInr(r.calls, r.day).inr }));
  const purposes = new Map<string, { purpose: string; calls: number; input: number; output: number; inr: number }>();
  for (const r of priced) {
    for (const c of r.calls) {
      const p = purposes.get(c.purpose) ?? { purpose: c.purpose, calls: 0, input: 0, output: 0, inr: 0 };
      p.calls++;
      p.input += c.input;
      p.output += c.output;
      p.inr += questionCostInr([c], r.day).inr;
      purposes.set(c.purpose, p);
    }
  }
  return {
    totals: totalsOf(priced),
    today: totalsOf(priced.filter((r) => r.day === today)),
    byDay: groupBy(priced, (r) => r.day).map(([day, rs]) => ({ day, ...totalsOf(rs) })),
    byAdmin: groupBy(priced, (r) => r.name)
      .map(([name, rs]) => ({ name, ...totalsOf(rs) }))
      .sort((a, b) => b.questions - a.questions),
    byPurpose: [...purposes.values()].sort((a, b) => b.input - a.input),
    recent: priced.slice(0, 25),
  };
}
