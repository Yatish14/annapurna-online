import type { ModelCall } from "./requestLog";

/**
 * The cost calculator (8.2): what a question would cost on Google's paid tier. We pay nothing (the free tier), but
 * this is what production would cost, and it shows which part of a question is expensive.
 *
 * Prices: Gemini API pricing page, Standard (not Batch), US dollars per 1 million tokens, read on 18 Nov 2026
 * (https://ai.google.dev/gemini-api/docs/pricing). Check it again before relying on these: prices change, and
 * Gemini 3.8 Flash already has a rise announced for 1 Jan 2027, which the table includes.
 */

type Price = {
  /** Dollars per 1M input tokens */
  input: number;
  /** Per 1M input tokens Google had cached (implicit caching: no storage charge) */
  cached: number;
  /** Per 1M output tokens, thinking included */
  output: number;
  /** The first day (India) this price applies; earlier entries apply before it */
  from?: string;
};

export const PRICES: Record<string, Price[]> = {
  "gemini-3.5-flash-lite": [{ input: 0.3, cached: 0.03, output: 2.5 }],
  "gemini-3.8-flash": [
    { input: 0.75, cached: 0.075, output: 3.75 },
    { input: 1.5, cached: 0.15, output: 7.5, from: "2027-01-01" },
  ],
  // The help search's embeddings (Step 6): input only. Not in the usage log yet (a query is ~10 tokens: $0.000002).
  "gemini-embedding-2": [{ input: 0.2, cached: 0.2, output: 0 }],
};

/**
 * Rupees per US dollar. An assumption, not a live rate: on 18 Nov 2026 the published rates seen were about ₹94–96.
 * ASSISTANT_USD_INR in .env.local changes it.
 */
export const USD_INR = Number(process.env.ASSISTANT_USD_INR) || 95;

/** The fake models stand in for Flash-Lite, so tests and the demo price them as Flash-Lite */
const STANDS_IN_FOR: Record<string, string> = { fake: "gemini-3.5-flash-lite" };

/** The price of a model on a day ("2026-11-18"), or null if it isn't in the table */
export function priceOn(model: string, day: string): Price | null {
  const list = PRICES[STANDS_IN_FOR[model] ?? model];
  if (!list) return null;
  return list.filter((p) => !p.from || p.from <= day).at(-1) ?? null;
}

/**
 * One call's cost in dollars: cached input at the cached price, the rest of the input at the input price, and the
 * output (thinking included) at the output price. Unknown model: null, so a total can say it's incomplete.
 */
export function callCostUsd(call: Pick<ModelCall, "model" | "input" | "output" | "cached">, day: string): number | null {
  const price = priceOn(call.model, day);
  if (!price) return null;
  const fresh = Math.max(0, call.input - call.cached);
  return (fresh * price.input + call.cached * price.cached + call.output * price.output) / 1_000_000;
}

/** A question's cost in rupees: all its calls added up (unknown models count as 0; `complete` says so) */
export function questionCostInr(calls: ModelCall[], day: string): { inr: number; complete: boolean } {
  let usd = 0;
  let complete = true;
  for (const c of calls) {
    const cost = callCostUsd(c, day);
    if (cost === null) complete = false;
    else usd += cost;
  }
  return { inr: usd * USD_INR, complete };
}

/**
 * Rupees for small amounts: "₹0.18" for paise, "₹0.0042" (two significant figures) below a paisa, "₹1,234.50" above.
 * A question costs a fraction of a rupee, so the usual 2 decimals would show most of them as ₹0.00.
 */
export function formatInr(inr: number): string {
  if (inr === 0) return "₹0";
  if (inr < 0.01) return `₹${inr.toPrecision(2)}`;
  return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
