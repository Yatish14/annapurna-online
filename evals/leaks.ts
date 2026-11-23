import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * The leak test (9.7): does any customer's or driver's name, phone number, admin's name or money amount from the
 * database appear in what would be sent to Google? Plain code, checking every request the model would get.
 *
 * Checked: what OUR SERVER adds to each request, the system prompt and the tools' results, for every secret. And
 * since phone masking (lib/assistant/phones.ts), the admin's own words and the chat's earlier answers too, for any
 * phone number at all: a typed number must reach the model only as "[phone 1]". Names and amounts the admin types
 * still go as typed (they're theirs to send, and the chat box says so, 9.6).
 */

/** Hears every request the model would get, and keeps the parts our server added, and the rest (for phones) */
export class RequestRecorder extends BaseCallbackHandler {
  name = "annapurna-leaks";
  sent: string[] = [];
  /** The admin's questions and the model's earlier answers, as sent */
  typed: string[] = [];

  async handleChatModelStart(_llm: Serialized, messages: BaseMessage[][]) {
    for (const m of messages.flat()) {
      const type = m.getType();
      if (type === "system" || type === "tool") this.sent.push(m.text);
      else this.typed.push(m.text, JSON.stringify((m as { tool_calls?: unknown }).tool_calls ?? []));
    }
  }
}

export type Secrets = { names: string[]; phones: string[]; amounts: number[] };

type Run = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * The secrets to look for, from the database: every customer's, referrer's, driver's and user's name (and users'
 * first names: the prompt used to carry one), every phone number, and every amount of ₹500 or more (smaller ones
 * would match counts and row numbers). Vehicle names aren't secrets: they're the business's own cars.
 */
export async function loadSecrets(run: Run): Promise<Secrets> {
  const names = await run<{ v: string }>(
    `SELECT customer_name AS v FROM trips UNION SELECT referrer_name FROM trips UNION SELECT name FROM drivers
     UNION SELECT name FROM users UNION SELECT split_part(name, ' ', 1) FROM users UNION SELECT customer_name FROM print_orders`,
  );
  const phones = await run<{ v: string }>(
    `SELECT customer_phone AS v FROM trips UNION SELECT referrer_phone FROM trips UNION SELECT phone FROM drivers
     UNION SELECT mobile FROM users UNION SELECT phone FROM print_orders`,
  );
  const amounts = await run<{ v: string }>(
    `SELECT total_amount AS v FROM trips UNION SELECT driver_amount FROM trips UNION SELECT amount FROM trip_payments
     UNION SELECT amount FROM vehicle_expenses`,
  );
  return {
    names: names.map((r) => r.v).filter((v): v is string => Boolean(v)),
    phones: phones.map((r) => r.v).filter((v): v is string => Boolean(v)),
    amounts: amounts.map((r) => Number(r.v)).filter((n) => n >= 500),
  };
}

/** Ways an amount can be written: 12000, 12,000 (international) and 12,000 / 1,20,000 (Indian), with or without ₹ */
function amountForms(n: number): string[] {
  const whole = Math.round(n);
  return [...new Set([String(whole), whole.toLocaleString("en-US"), whole.toLocaleString("en-IN")])];
}

/** Every secret found in a text, with what it was ("phone 98480 22338") */
export function findSecrets(text: string, secrets: Secrets): string[] {
  // Dates like 2026-11-18 aren't secrets, but they'd look like amounts (2026): take them out first
  const plain = text.replace(/\d{4}-\d{2}-\d{2}/g, " ");
  const found: string[] = [];
  // Names as whole words, any case (so "Eval" isn't found inside "evaluate")
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const name of secrets.names) {
    if (name.length >= 4 && new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "iu").test(plain)) found.push(`name "${name}"`);
  }
  const digits = plain.replace(/[\s-]/g, "");
  for (const phone of secrets.phones) if (digits.includes(phone)) found.push(`phone ${phone}`);
  for (const amount of secrets.amounts) {
    // Whole numbers only, not part of a longer number (so 500 doesn't match inside 2500 or VB-0500)
    const hit = amountForms(amount).find((form) => new RegExp(`(?<![\\d,.-])${form}(?![\\d,])`).test(plain));
    if (hit) found.push(`amount ${hit}`);
  }
  return found;
}
