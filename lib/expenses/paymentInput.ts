import { logActivity, type Actor } from "../activity";
import { parseLocalIST } from "../dates";
import { isPaymentMethod, parseAmount, type PaymentMethod } from "./money";
import type { Get } from "./tripInput";
import { addPayment, paymentText, type Party, type Trip } from "./trips";

/**
 * A payment on a booking (from the customer, or to the driver): its checks and its saving, shared by the booking
 * page's payment form and Annapurna Assist's payment drafts (4.9), the same way tripInput.ts is for bookings.
 * The values are read by the form's field names: party, amount, method, paid_at ("2026-11-16T15:20"), note.
 */

export type PaymentInput = { party: Party; amount: number; method: PaymentMethod; paidAt: string; note: string | null };

/** What can be wrong, by the booking page's flash names (components/admin/Flash.tsx), so its messages don't change */
export type PaymentProblem = "amount-invalid" | "invalid" | "paid-at-invalid";

/** The same problems in words, for the assistant (the same words the booking page shows) */
export const PAYMENT_PROBLEMS: Record<PaymentProblem, string> = {
  "amount-invalid": "Enter amounts in rupees, like 2500 or 2500.50 (up to ₹1 crore).",
  invalid: "Choose how it was paid: cash, UPI, bank transfer or other.",
  "paid-at-invalid": "Choose when the payment was made (it can't be in the future).",
};

/** The payment's values, checked in the order the booking page always did */
export function parsePayment(get: Get): { ok: true; payment: PaymentInput } | { ok: false; problem: PaymentProblem } {
  const party: Party = get("party") === "driver" ? "driver" : "customer";
  const amount = parseAmount(get("amount"), { allowZero: false });
  if (amount === null || amount === "invalid") return { ok: false, problem: "amount-invalid" };
  const method = String(get("method") ?? "");
  if (!isPaymentMethod(method)) return { ok: false, problem: "invalid" };
  const paidAt = parseLocalIST(get("paid_at"));
  if (!paidAt) return { ok: false, problem: "paid-at-invalid" };
  const note = String(get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
  return { ok: true, payment: { party, amount, method, paidAt, note } };
}

/**
 * Saves the payment and records it in the activity log. False if the booking is cancelled (payments can't be
 * added to it). `via` ends the log entry, e.g. "via Annapurna Assist".
 */
export async function savePayment(
  trip: Pick<Trip, "id" | "trip_no" | "driver_name">,
  p: PaymentInput,
  user: Actor,
  via?: string,
): Promise<boolean> {
  const saved = await addPayment(trip.id, p, user.name);
  if (!saved) return false;
  const text = `${paymentText(p)}${p.party === "driver" ? ` · to ${trip.driver_name}` : ""}`;
  await logActivity(user, p.party === "driver" ? "payment.driver_paid" : "payment.received", trip.trip_no, via ? `${text} · ${via}` : text);
  return true;
}
