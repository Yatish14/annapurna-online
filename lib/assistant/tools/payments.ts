import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { fmtRange, fmtShort, isIsoDate, nowLocalIST, todayIST } from "@/lib/dates";
import { formatRupees, PAYMENT_METHODS } from "@/lib/expenses/money";
import { parsePayment, PAYMENT_PROBLEMS } from "@/lib/expenses/paymentInput";
import { fromObject } from "@/lib/expenses/tripInput";
import { draftOwner, saveDraft } from "../draftStore";
import { findBooking } from "./findBooking";
import { freeText, toolReply } from "./result";

/**
 * draft_payment: prepares a payment on a booking (money the customer paid, or money paid to the driver) and checks
 * it with exactly the booking page's rules (parsePayment, lib/expenses/paymentInput.ts). It SAVES NO PAYMENT: like
 * draft_booking (4.2–4.6), a ready draft is kept on the server for the admin who asked, and is saved only when that
 * admin presses Confirm on its card (4.9).
 *
 * The booking can be its number ("VB-0012") or the customer's name ("Ravi"): our code finds it among bookings that
 * aren't cancelled, and asks which one if the name fits several.
 */

/** "15:20" → "3:20 pm" */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const ask = (note: string, extra: object = {}) => toolReply({ status: "failed", data: { ready: false, ...extra }, note });

export const draftPayment = tool(
  async (a, config) => {
    // 0. The booking (by number, or the customer's name matched by our code), and everything missing: all asked in
    //    one question, with the booking choices if the name fits several. Never a default method: how the money
    //    came matters for the accounts.
    const trip = a.booking ? await findBooking(a.booking) : null;
    const unclear = trip && !("id" in trip) ? trip : null;
    const missing = [!a.booking && "which booking", !a.amount && "the amount", !a.method && "how it was paid (cash, UPI, bank or other)"].filter(Boolean);
    if (missing.length || unclear || !trip || !("id" in trip)) {
      return ask(
        [unclear && `${unclear.why} Ask which, listing the choices if there are any; never choose for them.`,
          missing.length && `Still needed: ${missing.join(", ")}.`,
          "Ask the admin all of this in one short question; never fill anything in yourself."].filter(Boolean).join(" "),
        unclear ? { ask_about: [{ about: "booking", ...unclear }] } : { missing: "several" },
      );
    }
    if (trip.status === "cancelled") return ask(`${trip.trip_no} is cancelled, so payments can't be added to it. Tell the admin.`);

    // 2. The payment as the booking page's form fields, then the page's own checks
    const paidAt = !a.paid_on || a.paid_on === todayIST() ? nowLocalIST() : `${a.paid_on}T12:00`;
    const fields: Record<string, string> = {
      trip_id: String(trip.id),
      trip_no: trip.trip_no,
      party: a.party,
      amount: String(a.amount),
      method: a.method!,
      paid_at: paidAt,
      note: a.note ?? "",
    };
    const parsed = parsePayment(fromObject(fields));
    if (!parsed.ok) return ask(`${PAYMENT_PROBLEMS[parsed.problem]} (Ask the admin; never fill it in yourself.)`);
    const p = parsed.payment;

    // 3. What it leaves to pay, worked out by our code; more than that is a warning on the card, not a refusal
    //    (an extra charge may not be in the total yet)
    const [total, paidSoFar] = p.party === "customer" ? [trip.total_amount, trip.received] : [trip.driver_amount, trip.driver_paid];
    const left = total !== null ? total - paidSoFar - p.amount : null;
    const what = p.party === "customer" ? "total" : "driver's amount";
    const after =
      left === null
        ? `No ${what} is set on ${trip.trip_no} yet`
        : left >= 0
          ? `${formatRupees(left)} ${p.party === "customer" ? "still to pay" : "still owed to the driver"} after this`
          : `${formatRupees(-left)} more than the ${what}`;
    const warning = left !== null && left < 0 ? `This is ${formatRupees(-left)} more than what's left to pay on ${trip.trip_no}.` : null;

    // 4. Kept on the server for the admin who asked; the card gets only the id. No payment is saved.
    const draftId = await saveDraft(draftOwner(config, "draft_payment"), "payment", fields);
    const [day, time] = p.paidAt.split("T");
    return toolReply({
      status: "found",
      data: {
        ready: true,
        payment: {
          booking: `${trip.trip_no} · ${freeText(trip.customer_name, 60)} · ${fmtRange(trip.start_date, trip.end_date)}`,
          who: p.party === "customer" ? `${freeText(trip.customer_name, 60)} (the customer)` : `${freeText(trip.driver_name, 60)} (the driver)`,
          amount: formatRupees(p.amount),
          method: PAYMENT_METHODS[p.method],
          when: day === todayIST() ? `Today, ${clock(time)}` : fmtShort(day),
          note: freeText(p.note, 120),
          after,
        },
        warning,
        draft_id: draftId,
      },
      note:
        "Checked with the booking page's payment rules. NO PAYMENT IS SAVED. The admin sees these details on a card " +
        "under your answer, with a Confirm button; only their Confirm saves it, you can't.",
    });
  },
  {
    name: "draft_payment",
    description:
      "Prepares a payment on a booking: money the customer paid us, or money we paid the driver. Checks it with the " +
      "booking page's rules and says what's left to pay. It saves nothing: it says what's missing or unclear, or " +
      "returns the payment ready for the admin to check and confirm. Call it again with the answers.",
    schema: z.object({
      booking: z
        .string()
        .max(80)
        .optional()
        .describe(
          'The booking number if the admin said one ("VB-0012"); otherwise the customer\'s name exactly as the admin said it ' +
            '("Padma"). Don\'t look the booking up first or pick one yourself: this tool finds it, and gives choices if there are several.',
        ),
      party: z
        .enum(["customer", "driver"])
        .default("customer")
        .describe('"customer" for money the customer paid; "driver" only when the admin says the driver was paid.'),
      amount: z.number().positive().optional().describe("Rupees. Only the amount the admin said; never work one out."),
      method: z.enum(["cash", "upi", "bank", "other"]).optional().describe("How it was paid. Only if the admin said; never guess."),
      paid_on: z
        .string()
        .refine(isIsoDate, "A date like 2026-11-15")
        .optional()
        .describe("YYYY-MM-DD, only if the admin said it was paid on another day (use get_today for 'yesterday'). Leave out for now."),
      note: z.string().max(120).optional(),
    }),
    responseFormat: "content_and_artifact",
  },
);
