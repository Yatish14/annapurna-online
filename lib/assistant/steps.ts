import { fmtShort } from "@/lib/dates";
import { monthText } from "@/lib/expenses/finance";
import type { ToolStep } from "./types";

/**
 * The chip the chat shows while a tool runs ("Checked bookings…", then a tick). Plain words for the admin,
 * from the tool's name and the inputs the model chose, so "Opened VB-0022" says exactly what was looked at.
 * A tool missing here still gets a chip, from its name.
 */
type Args = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");

const STEPS: Record<string, (args: Args) => ToolStep> = {
  get_today: () => ({ label: "Checked the date", icon: "calendar" }),
  list_bookings: (a) => ({
    label: `Checked ${a.status && a.status !== "all" ? `${a.status} ` : ""}bookings${a.from ? ` from ${fmtShort(text(a.from))}` : ""}`,
    icon: "bookings",
  }),
  get_booking: (a) => ({ label: `Opened ${text(a.number).toUpperCase() || "a booking"}`, icon: "bookings" }),
  search_bookings: (a) => ({ label: `Searched bookings for "${text(a.query)}"`, icon: "search" }),
  balances_due: () => ({ label: "Checked balances due", icon: "rupee" }),
  month_overview: (a) => ({ label: `Checked ${a.month ? monthText(text(a.month)) : "this month"}'s money`, icon: "chart" }),
  vehicle_summary: () => ({ label: "Checked vehicles", icon: "car" }),
  driver_summary: () => ({ label: "Checked drivers", icon: "steering" }),
  print_orders: () => ({ label: "Checked printouts", icon: "printer" }),
};

export function stepFor(name: string, args: Args = {}): ToolStep {
  try {
    return STEPS[name]?.(args) ?? { label: `Used ${name.replace(/_/g, " ")}`, icon: "sparkle" };
  } catch {
    // A label must never break an answer (e.g. an odd date the model sent)
    return { label: `Used ${name.replace(/_/g, " ")}`, icon: "sparkle" };
  }
}
