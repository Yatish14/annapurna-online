import { fmtShort } from "@/lib/dates";
import { monthText } from "@/lib/expenses/finance";
import { resolveMonth } from "./months";
import type { ToolStep } from "./types";

/**
 * The chip the chat shows while a tool runs ("Checked bookings…", then a tick). Plain words for the admin,
 * from the tool's name and the inputs the model chose, so "Opened VB-0022" says exactly what was looked at.
 * A tool missing here still gets a chip, from its name.
 */
type Args = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** "last month" → "October 2026", as the tool itself will read it (the admin's words if it isn't a month) */
function monthName(v: unknown): string {
  const m = resolveMonth(text(v));
  return m ? monthText(m) : `"${text(v)}"`;
}

const STEPS: Record<string, (args: Args) => ToolStep> = {
  get_today: () => ({ label: "Checked the date", icon: "calendar" }),
  list_bookings: (a) => ({
    label: `Checked ${a.status && a.status !== "all" ? `${a.status} ` : ""}bookings${a.from ? ` from ${fmtShort(text(a.from))}` : ""}`,
    icon: "bookings",
  }),
  get_booking: (a) => ({ label: `Opened ${text(a.number).toUpperCase() || "a booking"}`, icon: "bookings" }),
  search_bookings: (a) => ({ label: `Searched bookings for "${text(a.query)}"`, icon: "search" }),
  balances_due: () => ({ label: "Checked balances due", icon: "rupee" }),
  month_overview: (a) => ({ label: `Checked ${monthName(a.month)}'s money`, icon: "chart" }),
  vehicle_summary: (a) => ({ label: `Checked vehicles${a.month ? ` for ${monthName(a.month)}` : ""}`, icon: "car" }),
  driver_summary: (a) => ({ label: `Checked drivers${a.month ? ` for ${monthName(a.month)}` : ""}`, icon: "steering" }),
  print_orders: () => ({ label: "Checked printouts", icon: "printer" }),
  report: (a) => ({ label: `Read ${monthName(a.month)}'s report`, icon: "chart" }),
  draft_booking: () => ({ label: "Checked the booking details", icon: "plus" }),
  draft_payment: () => ({ label: "Checked the payment details", icon: "rupee" }),
  draft_fuel: () => ({ label: "Checked the fuel details", icon: "fuel" }),
  draft_discount: () => ({ label: "Checked the discount", icon: "tag" }),
  search_help: () => ({ label: "Searched the help guides", icon: "file" }),
  // Neutral words: the chip shows before the tool runs, and the booking may not exist or may have no total yet
  expense_statement: (a) => ({ label: `Statement for ${text(a.number).toUpperCase() || "a booking"}`, icon: "receipt" }),
};

export function stepFor(name: string, args: Args = {}): ToolStep {
  try {
    return STEPS[name]?.(args) ?? { label: `Used ${name.replace(/_/g, " ")}`, icon: "sparkle" };
  } catch {
    // A label must never break an answer (e.g. an odd date the model sent)
    return { label: `Used ${name.replace(/_/g, " ")}`, icon: "sparkle" };
  }
}
