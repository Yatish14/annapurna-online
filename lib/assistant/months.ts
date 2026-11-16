import { z } from "zod";
import { MONTHS_LONG, todayIST } from "@/lib/dates";
import { addMonths } from "@/lib/expenses/finance";

/**
 * The month an admin means, worked out by our code instead of the model ("last month" in January is December of the
 * year before; "September" asked in March means last September). Month tools take the words as said, and every
 * tool result says which month was used ("October 2026"), so the answer can't quietly be about a different one.
 *
 *   "2026-10", "this month", "last month", "next month", "3 months ago",
 *   "September", "sep", "Sept 2025", "September '25", "oct-2025"   →   "YYYY-MM", or null if it isn't a month
 */
export function resolveMonth(text: string | undefined, today = todayIST()): string | null {
  const thisMonth = today.slice(0, 7);
  const t = (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t || t === "this month" || t === "current month") return thisMonth;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) return t;
  if (t === "last month" || t === "previous month") return addMonths(thisMonth, -1);
  if (t === "next month") return addMonths(thisMonth, 1);
  const ago = /^(\d{1,2}) months? ago$/.exec(t);
  if (ago) return addMonths(thisMonth, -Number(ago[1]));

  // A month's name (or its first 3+ letters), maybe with a year: "sep", "september 2025", "sept '25", "oct-2025"
  const named = /^([a-z]{3,9})\.?(?:[\s,-]+'?(\d{2}|\d{4}))?$/.exec(t);
  if (!named) return null;
  const index = MONTHS_LONG.findIndex((m) => m.toLowerCase().startsWith(named[1]));
  if (index === -1) return null;
  const mm = String(index + 1).padStart(2, "0");
  if (named[2]) return `${named[2].length === 2 ? `20${named[2]}` : named[2]}-${mm}`;
  // No year: the latest one that isn't in the future ("September" in March 2027 → September 2026)
  const sameYear = `${thisMonth.slice(0, 4)}-${mm}`;
  return sameYear <= thisMonth ? sameYear : `${Number(thisMonth.slice(0, 4)) - 1}-${mm}`;
}

/** The `month` input of every month tool: the admin's own words, checked by resolveMonth() before anything runs */
export const monthInput = z
  .string()
  .trim()
  .max(30)
  .describe(
    'The month, in the admin\'s words or as YYYY-MM: "last month", "this month", "September", "Oct 2025", "2026-10". ' +
      "Pass the words as they are; don't work out the month yourself.",
  );

/** What a month tool says when it can't tell which month was meant */
export const unknownMonth = (text: string) =>
  `Couldn't tell which month "${text}" is. Ask the admin, or pass a month name or YYYY-MM.`;
