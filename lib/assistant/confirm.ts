import type { SessionUser } from "@/lib/auth";
import { cancelPendingDraft, claimDraft, type Draft, finishDraft, getDraft, releaseDraft } from "@/lib/assistant/draftStore";
import { FUEL_PROBLEMS, parseFuel, saveFuel } from "@/lib/expenses/fuelInput";
import { parsePayment, PAYMENT_PROBLEMS, savePayment } from "@/lib/expenses/paymentInput";
import { DISCOUNT_PROBLEMS, saveDiscount } from "@/lib/expenses/discountInput";
import { formatRupees } from "@/lib/expenses/money";
import { checkTrip, createCheckedTrip, fromObject, parseTrip } from "@/lib/expenses/tripInput";
import { balanceOf, getTripById } from "@/lib/expenses/trips";

/**
 * What Annapurna Assist's draft card buttons do: Confirm (4.6) and Cancel (4.11), for an admin already checked by the
 * caller (app/admin/assistant/actions.ts, the server actions). Kept here, outside the server action, so the tests can
 * call it directly, several times at once (tests/drafts.spec.ts, 4.12).
 *
 * Only the draft's id comes from the browser: the values come from the server (assistant_drafts, 4.5), for this
 * admin only, and Confirm checks them again with the page's own rules, because things change after the draft was
 * made (the vehicle may be booked meanwhile).
 */

/** What the card should show now, when the server knows better than the card (saved in another tab, expired…) */
export type CardState =
  | { status: "confirmed"; result: string; resultHref: string }
  | { status: "cancelled" }
  | { status: "expired" };

export type DraftActionResult =
  | { ok: true; /** For the card: "Saved as VB-0042." */ message: string; href: string }
  | { ok: false; error: string; card?: CardState };

/** A save that worked gives what the draft became: the new booking "VB-0042", or the booking or vehicle it went on */
type Saved = { ok: true; result: string } | { ok: false; error: string };

/** A draft that's been saved stays "being saved" this long at most; longer means the save broke off halfway */
const STUCK_MINUTES = 5;

/** Confirm, for an admin the caller has checked */
export async function confirmDraftAs(user: SessionUser, id: unknown, typed?: unknown): Promise<DraftActionResult> {
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };
  // Privacy-first mode (9.5): what the admin typed on the card, as plain strings only (it comes from the browser).
  // The booking form's own checks (parseTrip) then decide whether the name and number are acceptable.
  const card = typed && typeof typed === "object" ? (typed as Record<string, unknown>) : {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const onCard = { customer_name: text(card.customer_name, 80), customer_phone: text(card.customer_phone, 20) };

  // Take it: one statement, so a double-click (or two tabs) saves it once. Expired or cancelled ones can't be taken.
  const draft = await claimDraft(id, user.id);
  if (!draft) return whyNot(id, user.id);

  // A booking whose customer is typed on the card (9.5): those two from the card, everything else from the server
  const toCard = draft.kind === "booking" && draft.fields.customer_on_card === "1";
  if (toCard && (!onCard.customer_name || !onCard.customer_phone)) {
    await releaseDraft(id);
    return { ok: false, error: "Type the customer's name and mobile number on the card first. Nothing was saved." };
  }
  const fields = toCard ? { ...draft.fields, ...onCard } : draft.fields;

  // Each kind is checked again with its own page's rules, on the values kept on the server
  const saved =
    draft.kind === "booking"
      ? await saveBooking(fields, user)
      : draft.kind === "payment"
        ? await savePaymentDraft(draft.fields, user)
        : draft.kind === "discount"
          ? await saveDiscountDraft(draft.fields, user)
          : await saveFuelDraft(draft.fields, user);
  if (!saved.ok) {
    await releaseDraft(id); // still pending: the admin can fix what's wrong, or ask again
    return { ok: false, error: `${saved.error} Nothing was saved.` };
  }
  await finishDraft(id, saved.result);
  const { result, resultHref } = savedText(draft.kind, draft.fields, saved.result);
  return { ok: true, message: result, href: resultHref };
}

/**
 * Cancel (4.11): the draft can't be confirmed after this, from any tab, and the model is told it was cancelled
 * (afterDraft, 4.7). Only a pending draft can be cancelled: one already saved stays saved.
 */
export async function cancelDraftAs(user: SessionUser, id: unknown): Promise<DraftActionResult> {
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };
  if (await cancelPendingDraft(id, user.id)) return { ok: true, message: "Cancelled. Nothing was saved.", href: "" };
  return whyNot(id, user.id);
}

/**
 * What a draft's card should show, from the database: saved (with what it became and its link), cancelled or
 * expired. Null while it's still waiting for Confirm, or while it's being saved. Used when Confirm or Cancel finds
 * it settled already, and when a saved chat is opened (5.3), so an old card shows what became of it.
 */
export function cardState(d: Draft): CardState | null {
  if (d.status === "confirmed") return d.result ? { status: "confirmed", ...savedText(d.kind, d.fields, d.result) } : null;
  if (d.status === "cancelled") return { status: "cancelled" };
  return d.expired ? { status: "expired" } : null;
}

/** "Saved as VB-0042." and where to see it: the same words on the card after Confirm and when it was saved elsewhere */
function savedText(kind: Draft["kind"], fields: Record<string, string>, result: string): { result: string; resultHref: string } {
  if (kind === "booking") return { result: `Saved as ${result}.`, resultHref: `/admin/expenses/bookings/${result}` };
  if (kind === "payment") {
    const anchor = fields.party === "driver" ? "#driver-payments" : "#customer-payments";
    return { result: `Payment saved on ${result}.`, resultHref: `/admin/expenses/bookings/${result}${anchor}` };
  }
  if (kind === "discount") {
    return {
      result: fields.discount_amount ? `Discount saved on ${result}.` : `Discount removed from ${result}.`,
      resultHref: `/admin/expenses/bookings/${result}#customer-payments`,
    };
  }
  return fields.trip_id
    ? { result: `Fuel saved on ${result}.`, resultHref: `/admin/expenses/bookings/${result}#fuel` }
    : { result: `Fuel saved for ${result}.`, resultHref: `/admin/expenses/fleet/${fields.vehicle_id}#fuel` };
}

/** A booking draft: the booking form's checks again, then saved and logged exactly like one from the form */
async function saveBooking(fields: Record<string, string>, user: SessionUser): Promise<Saved> {
  const parsed = parseTrip(fromObject(fields), true);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const check = await checkTrip(parsed.input, { allowDriverClash: fields.allow_driver_clash === "1" });
  if (!check.ok) return { ok: false, error: "driverClash" in check ? check.driverClash : check.error };
  const saved = await createCheckedTrip(parsed, check, user, "via Annapurna Assist");
  return saved.ok ? { ok: true, result: saved.tripNo } : saved;
}

/** A payment draft (4.9): the booking page's payment checks again, then saved and logged like one from that page */
async function savePaymentDraft(fields: Record<string, string>, user: SessionUser): Promise<Saved> {
  const parsed = parsePayment(fromObject(fields));
  if (!parsed.ok) return { ok: false, error: PAYMENT_PROBLEMS[parsed.problem] };
  const trip = await getTripById(Number(fields.trip_id));
  if (!trip) return { ok: false, error: "That booking no longer exists." };
  if (!(await savePayment(trip, parsed.payment, user, "via Annapurna Assist"))) {
    return { ok: false, error: `${trip.trip_no} is cancelled, so payments can't be added to it.` };
  }
  return { ok: true, result: trip.trip_no };
}

/**
 * A discount draft: the rupees shown on the card, checked again against the booking as it is now (paid or changed
 * since?), then saved and logged like "Settle the rest as discount" or the edit form on the booking's page.
 */
async function saveDiscountDraft(fields: Record<string, string>, user: SessionUser): Promise<Saved> {
  const trip = await getTripById(Number(fields.trip_id));
  if (!trip) return { ok: false, error: DISCOUNT_PROBLEMS.missing };
  const amount = fields.discount_amount ? Number(fields.discount_amount) : null;
  if (amount !== null && !(amount > 0)) return { ok: false, error: DISCOUNT_PROBLEMS["too-big"] };
  // A settle draft is for the balance it showed: if a payment came in since, the balance changed, so ask again
  if (fields.settle === "1" && balanceOf(trip) !== Number(fields.settled_balance)) {
    return { ok: false, error: `${trip.trip_no}'s balance has changed since this draft. Ask again to settle what's left now.` };
  }
  const saved = await saveDiscount(trip, { amount, reason: fields.discount_reason || null }, user, {
    via: "via Annapurna Assist",
    note: fields.settle === "1" ? `settled the balance of ${formatRupees(Number(fields.settled_balance))}` : undefined,
  });
  return saved.ok ? { ok: true, result: trip.trip_no } : { ok: false, error: DISCOUNT_PROBLEMS[saved.problem] };
}

/** A fuel draft (4.10): the fuel form's checks again, then saved and logged like one from the booking or vehicle page */
async function saveFuelDraft(fields: Record<string, string>, user: SessionUser): Promise<Saved> {
  const parsed = parseFuel(fromObject(fields));
  if (!parsed.ok) return { ok: false, error: FUEL_PROBLEMS[parsed.problem] };
  const target = fields.trip_id ? { tripId: Number(fields.trip_id) } : { vehicleId: Number(fields.vehicle_id) };
  const saved = await saveFuel(target, parsed.fuel, user, "via Annapurna Assist");
  if (!saved) {
    return { ok: false, error: fields.trip_id ? `${fields.trip_no} is cancelled, so fuel can't be added to it.` : "That vehicle no longer exists." };
  }
  return { ok: true, result: saved.trip_no ?? saved.vehicle_name };
}

/** Why a draft couldn't be confirmed or cancelled, in words for the admin, and what its card should show now */
async function whyNot(id: string, userId: number): Promise<DraftActionResult> {
  const draft = await getDraft(id, userId);
  if (!draft) return { ok: false, error: "This draft wasn't found." };
  const card = cardState(draft);
  // The card shows what it became ("Saved as VB-0042.", with its link); the message just says why nothing happened
  if (card?.status === "confirmed") return { ok: false, error: "This draft was already saved.", card };
  if (draft.status === "confirmed") {
    // Taken for saving, but the save never finished. It may or may not have been saved, so it isn't simply put
    // back: pressing Confirm again could save it twice.
    return draft.minutesSinceSettled >= STUCK_MINUTES
      ? { ok: false, error: "Saving this draft broke off halfway. Check the Bookings page; if it isn't there, ask again for a new draft." }
      : { ok: false, error: "It's being saved already." };
  }
  if (draft.status === "cancelled") return { ok: false, error: "This draft was cancelled. Ask again for a new one.", card: { status: "cancelled" } };
  return { ok: false, error: "This draft has expired (drafts last 24 hours). Ask again for a new one.", card: { status: "expired" } };
}
