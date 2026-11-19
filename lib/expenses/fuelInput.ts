import { logActivity, type Actor } from "../activity";
import { isIsoDate } from "../dates";
import { parseAmount } from "./money";
import type { Get } from "./tripInput";
import { addExpense, expenseText, type ExpenseInput } from "./trips";

/**
 * A fuel fill: its checks and its saving, shared by the booking and vehicle pages' fuel form (recordExpense) and
 * Annapurna Assist's fuel drafts (4.10), as paymentInput.ts is for payments. Fuel goes on a booking (the booking's
 * vehicle is used) or straight on a vehicle. Values by the form's field names: amount, spent_on, litres, note.
 */

/** What can be wrong, by the pages' flash names (components/admin/Flash.tsx), so their messages don't change */
export type FuelProblem = "amount-invalid" | "date-invalid" | "litres-invalid";

/** The same problems in words, for the assistant (the words the pages show) */
export const FUEL_PROBLEMS: Record<FuelProblem, string> = {
  "amount-invalid": "Enter amounts in rupees, like 2500 or 2500.50 (up to ₹1 crore).",
  "date-invalid": "Choose a valid date.",
  "litres-invalid": "Enter the litres as a number, like 35 or 35.5 (or leave it empty).",
};

/** The fill's values, checked in the order the pages always did: amount, date, litres */
export function parseFuel(get: Get): { ok: true; fuel: ExpenseInput } | { ok: false; problem: FuelProblem } {
  const amount = parseAmount(get("amount"), { allowZero: false });
  if (amount === null || amount === "invalid") return { ok: false, problem: "amount-invalid" };
  const spentOn = String(get("spent_on") ?? "").trim();
  if (!isIsoDate(spentOn) || spentOn < "2020-01-01" || spentOn > "2099-12-31") return { ok: false, problem: "date-invalid" };
  const litres = parseAmount(get("litres"), { allowZero: false });
  if (litres === "invalid" || (litres !== null && litres > 9999)) return { ok: false, problem: "litres-invalid" };
  const note = String(get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  return {
    ok: true,
    fuel: { kind: "fuel", amount, spentOn, litres, description: null, shopName: null, shopState: null, shopCity: null, note },
  };
}

/**
 * Saves the fill and records it in the activity log. Null if the booking is cancelled or the vehicle doesn't exist.
 * `via` ends the log entry, e.g. "via Annapurna Assist".
 */
export async function saveFuel(
  target: { tripId: number } | { vehicleId: number },
  fuel: ExpenseInput,
  user: Actor,
  via?: string,
): Promise<{ vehicle_name: string; trip_no: string | null } | null> {
  const saved = await addExpense(target, fuel, user.name);
  if (!saved) return null;
  const details = expenseText({
    kind: "fuel", amount: fuel.amount, litres: fuel.litres, description: null, shop_name: null, shop_city: null, shop_state: null, note: fuel.note,
  });
  const text = saved.trip_no ? `${details} · ${saved.vehicle_name}` : details;
  await logActivity(user, "expense.fuel_added", saved.trip_no ?? saved.vehicle_name, via ? `${text} · ${via}` : text);
  return saved;
}
