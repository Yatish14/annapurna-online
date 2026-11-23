import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { fmtRange } from "@/lib/dates";
import { overpaidBy, parseDiscount, settledDiscount } from "@/lib/expenses/discountInput";
import { formatRupees } from "@/lib/expenses/money";
import { fromObject } from "@/lib/expenses/tripInput";
import { balanceOf, discountText, payableOf, type TripDiscount } from "@/lib/expenses/trips";
import { draftOwner, saveDraft } from "../draftStore";
import { findBooking } from "./findBooking";
import { freeText, toolReply } from "./result";

/**
 * draft_discount: prepares a discount on a booking: an amount or a percentage off the total, "settle the rest" (the
 * balance still to pay becomes discount), or removing the discount. Checked with exactly the booking page's rules
 * (lib/expenses/discountInput.ts). It SAVES NO DISCOUNT: like the other drafts, a ready one is kept on the server for
 * the admin who asked and saved only by their Confirm (lib/assistant/confirm.ts).
 *
 * The card shows the discount in rupees, worked out by our code; Confirm saves exactly that (and checks it again).
 */

const ask = (note: string, extra: object = {}) => toolReply({ status: "failed", data: { ready: false, ...extra }, note });

export const draftDiscount = tool(
  async (a, config) => {
    // 0. The booking (by number, or the customer's name matched by our code), and what to do with its discount
    const trip = a.booking ? await findBooking(a.booking) : null;
    const unclear = trip && !("id" in trip) ? trip : null;
    const how = [a.amount != null, a.percent != null, a.settle, a.remove].filter(Boolean).length;
    const missing = [!a.booking && "which booking", how === 0 && "how much discount (in rupees or a percentage), or whether to settle the balance"].filter(Boolean);
    if (missing.length || unclear || !trip || !("id" in trip)) {
      return ask(
        [unclear && `${unclear.why} Ask which, listing the choices if there are any; never choose for them.`,
          missing.length && `Still needed: ${missing.join(", ")}.`,
          "Ask the admin all of this in one short question; never fill anything in yourself."].filter(Boolean).join(" "),
        unclear ? { ask_about: [{ about: "booking", ...unclear }] } : { missing: "several" },
      );
    }
    if (how > 1) return ask("Give one of: an amount, a percentage, settle the balance, or remove the discount. Ask the admin which they meant.");
    if (trip.status === "cancelled") return ask(`${trip.trip_no} is cancelled, so its discount can't be changed. Tell the admin.`);
    if (trip.total_amount === null) {
      return ask(`${trip.trip_no} has no total yet, so there's nothing to give a discount on. Tell the admin to enter the total first.`);
    }

    // 1. The new discount, worked out by our code: never by the model
    let next: TripDiscount;
    if (a.remove) {
      if (trip.discount === null) return ask(`${trip.trip_no} has no discount to remove. Tell the admin.`);
      next = { amount: null, reason: null };
    } else if (a.settle) {
      const settled = settledDiscount(trip);
      if (!settled) return ask(`${trip.trip_no} has nothing left to pay, so there's no balance to settle. Tell the admin.`);
      next = a.reason ? { ...settled, reason: a.reason.trim().slice(0, 60) } : settled;
    } else {
      const parsed = parseDiscount(
        fromObject({
          discount_amount: String(a.percent ?? a.amount),
          discount_mode: a.percent != null ? "pct" : "rs",
          discount_reason: a.reason ?? trip.discount_reason ?? "",
        }),
        trip.total_amount,
      );
      if (!parsed.ok) return ask(`${parsed.error} (Ask the admin; never fill it in yourself.)`);
      next = parsed.discount;
    }
    const overpaid = overpaidBy(trip.total_amount, next, trip.received);
    if (overpaid) return ask(`${overpaid} (Tell the admin; never change the amount yourself.)`);
    if (next.amount === trip.discount && (next.reason ?? null) === (trip.discount_reason ?? null)) {
      return ask(`${trip.trip_no} already has exactly that discount. Tell the admin nothing needs changing.`);
    }

    // 2. What it changes, for the card: the discount before and after, and what the customer then pays and owes
    const after = { total_amount: trip.total_amount, discount: next.amount, received: trip.received };
    const replaces = !a.remove && !a.settle && trip.discount !== null;
    const fields: Record<string, string> = {
      trip_id: String(trip.id),
      trip_no: trip.trip_no,
      discount_amount: next.amount === null ? "" : String(next.amount),
      discount_reason: next.reason ?? "",
      ...(a.settle ? { settle: "1", settled_balance: String(balanceOf(trip)) } : {}),
    };

    // 3. Kept on the server for the admin who asked; the card gets only the id. No discount is saved.
    const draftId = await saveDraft(draftOwner(config, "draft_discount"), "discount", fields);
    return toolReply({
      status: "found",
      data: {
        ready: true,
        discount: {
          booking: `${trip.trip_no} · ${freeText(trip.customer_name, 60)} · ${fmtRange(trip.start_date, trip.end_date)}`,
          action: a.remove ? "remove" : a.settle ? "settle" : "set",
          total: formatRupees(trip.total_amount),
          before: discountText(trip.discount, freeText(trip.discount_reason, 60)),
          after: discountText(next.amount, freeText(next.reason, 60)),
          to_pay: formatRupees(payableOf(after) ?? 0),
          received: formatRupees(trip.received),
          balance_after: balanceOf(after) > 0 ? `${formatRupees(balanceOf(after))} still to pay` : "Fully paid",
        },
        warning: replaces ? `This replaces the ${formatRupees(trip.discount!)} discount ${trip.trip_no} already has (it doesn't add to it).` : null,
        draft_id: draftId,
      },
      note:
        "Checked with the booking page's discount rules. NO DISCOUNT IS SAVED. The admin sees these details on a card " +
        "under your answer, with a Confirm button; only their Confirm saves it, you can't.",
    });
  },
  {
    name: "draft_discount",
    description:
      "Prepares a discount on an existing booking: an amount in rupees or a percentage off its total, settling the " +
      "balance (what's still to pay becomes discount, so the booking is fully paid), or removing its discount. A " +
      "booking has one discount: a new amount replaces the old one. Checks it with the booking page's rules and says " +
      "what the customer then pays. It saves nothing: it says what's missing or unclear, or returns the discount " +
      "ready for the admin to check and confirm. Call it again with the answers. (For a NEW booking, put the " +
      "discount in draft_booking instead.)",
    schema: z.object({
      booking: z
        .string()
        .max(80)
        .optional()
        .describe(
          'The booking number if the admin said one ("VB-0012"); otherwise the customer\'s name exactly as the admin said it. ' +
            "Don't look the booking up first or pick one yourself: this tool finds it, and gives choices if there are several.",
        ),
      amount: z.number().positive().optional().describe("Rupees off the total, only as the admin said it. Never work one out."),
      percent: z.number().positive().max(100).optional().describe('Only for a percentage the admin said: 5 for "5% off". Our code works out the rupees.'),
      settle: z
        .boolean()
        .optional()
        .describe('True when the admin wants to let the rest of the balance go ("settle it", "leave the remaining", "waive the balance").'),
      remove: z.boolean().optional().describe("True only when the admin asks to remove or cancel the booking's discount."),
      reason: z.string().max(60).optional().describe('Why, if the admin said ("regular customer", "festival offer").'),
    }),
    responseFormat: "content_and_artifact",
  },
);
