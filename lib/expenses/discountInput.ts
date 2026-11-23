import { logActivity, type Actor } from "../activity";
import { formatRupees, parseAmount } from "./money";
import type { Get } from "./tripInput";
import { balanceOf, payableOf, setDiscount, type Trip, type TripDiscount } from "./trips";

/**
 * A booking's discount: its checks and its saving, shared by the booking form (new and edit), the booking page's
 * "Settle the rest as discount" and "Remove discount", and Annapurna Assist's discount drafts, the same way
 * paymentInput.ts is for payments. So a discount follows the same rules, with the same messages, wherever it's given.
 *
 * The discount is kept in rupees. A percentage is turned into rupees of the total when it's read (5% of ₹12,000 =
 * ₹600), so changing the total later doesn't quietly change the discount.
 */

/** Longest reason kept ("Regular customer", "Festival offer") */
export const REASON_MAX = 60;

/** Why a balance was let go, when "Settle the rest as discount" is pressed on a booking that has no reason yet */
export const SETTLE_REASON = "Balance let go when settling";

export type ParsedDiscount = { ok: true; discount: TripDiscount } | { ok: false; field: string; error: string };

/**
 * The discount from the form's fields: discount_amount, discount_mode ("rs" or "pct") and discount_reason. Empty
 * or 0 means no discount. `total` is the booking's total as entered in the same form (null when empty).
 */
export function parseDiscount(get: Get, total: number | null): ParsedDiscount {
  const fail = (field: string, error: string): ParsedDiscount => ({ ok: false, field, error });
  const percent = get("discount_mode") === "pct";
  const raw = parseAmount(get("discount_amount"));
  if (raw === "invalid") {
    return fail("discount_amount", percent ? "Enter the discount as a percentage, like 5 or 7.5." : "Enter the discount in rupees, like 500.");
  }
  const reason = String(get("discount_reason") ?? "").replace(/\s+/g, " ").trim().slice(0, REASON_MAX) || null;
  if (raw === null || raw === 0) return { ok: true, discount: { amount: null, reason: null } };
  if (total === null) {
    return fail("total_amount", percent ? "Enter the total first: a percentage discount is worked out from it." : "Enter the total before giving a discount.");
  }
  if (percent && raw > 100) return fail("discount_amount", "A percentage discount can be at most 100%.");
  // Whole rupees for a percentage (5% of ₹12,345 = ₹617)
  const amount = percent ? Math.round((total * raw) / 100) : raw;
  if (amount <= 0) return { ok: true, discount: { amount: null, reason: null } };
  if (amount > total) return fail("discount_amount", `The discount can't be more than the total (${formatRupees(total)}).`);
  return { ok: true, discount: { amount, reason } };
}

/**
 * With this discount, the customer would owe less than they've already paid: the message to show, or null if fine.
 * (Overpaying by mistake is allowed elsewhere, with a warning; but a discount that creates it would mean refunding
 * money that was never owed back, so the form stops it.)
 */
export function overpaidBy(total: number | null, discount: TripDiscount, received: number): string | null {
  const payable = payableOf({ total_amount: total, discount: discount.amount });
  if (payable === null || received <= payable || discount.amount === null) return null;
  const most = Math.max((total ?? 0) - received, 0);
  return (
    `With this discount the customer would owe ${formatRupees(payable)}, but has already paid ${formatRupees(received)}. ` +
    (most > 0 ? `The discount can be at most ${formatRupees(most)}.` : "There's nothing left to give a discount on.")
  );
}

/** For "Settle the rest as discount": the booking's discount once its whole balance is let go */
export function settledDiscount(t: Pick<Trip, "total_amount" | "discount" | "discount_reason" | "received">): TripDiscount | null {
  const balance = balanceOf(t);
  if (t.total_amount === null || balance <= 0) return null;
  return { amount: Math.round(((t.discount ?? 0) + balance) * 100) / 100, reason: t.discount_reason ?? SETTLE_REASON };
}

/** What can go wrong saving a discount on its own, in words for the admin (and the assistant) */
export const DISCOUNT_PROBLEMS = {
  missing: "That booking no longer exists.",
  cancelled: "The booking is cancelled, so its discount can't be changed. Restore it first.",
  "no-total": "The booking has no total yet. Enter the total first.",
  "too-big": "The discount can't be more than the booking's total.",
  overpaid: "The customer has already paid more than they would owe with this discount.",
} as const;
export type DiscountProblem = keyof typeof DISCOUNT_PROBLEMS;

/**
 * Saves a discount on a booking (null amount: removes it) and records it in the activity log. Checks it against
 * the booking as it is now: not cancelled, has a total, the discount fits in it and doesn't leave the customer
 * overpaid. `via` ends the log entry, e.g. "via Annapurna Assist"; `note` too ("settled the balance").
 */
export async function saveDiscount(
  trip: Pick<Trip, "id" | "total_amount" | "received">,
  d: TripDiscount,
  user: Actor,
  { via, note }: { via?: string; note?: string } = {},
): Promise<{ ok: true; trip_no: string; changed: boolean } | { ok: false; problem: DiscountProblem }> {
  if (overpaidBy(trip.total_amount, d, trip.received)) return { ok: false, problem: "overpaid" };
  const saved = await setDiscount(trip.id, d, user.name);
  if (!saved.ok) return { ok: false, problem: saved.reason };
  if (saved.change) {
    await logActivity(user, "trip.discount_changed", saved.trip_no, [saved.change, note, via].filter(Boolean).join(" · "));
  }
  return { ok: true, trip_no: saved.trip_no, changed: Boolean(saved.change) };
}
