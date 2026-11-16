"use server";

import { revalidatePath } from "next/cache";
import { can, currentUser, type SessionUser } from "@/lib/auth";
import { cancelPendingDraft, claimDraft, type Draft, finishDraft, getDraft, releaseDraft } from "@/lib/assistant/draftStore";
import { FUEL_PROBLEMS, parseFuel, saveFuel } from "@/lib/expenses/fuelInput";
import { parsePayment, PAYMENT_PROBLEMS, savePayment } from "@/lib/expenses/paymentInput";
import { checkTrip, createCheckedTrip, fromObject, parseTrip } from "@/lib/expenses/tripInput";
import { getTripById } from "@/lib/expenses/trips";

/**
 * Annapurna Assist's draft card buttons: Confirm (4.6) and Cancel (4.11). The browser sends only the draft's id: the
 * values come from the server (assistant_drafts, 4.5), for the signed-in admin only, and Confirm checks them again
 * with the page's own rules, because things change after the draft was made (the vehicle may be booked meanwhile).
 *
 * Like every server action, these can be called by a direct POST, not just from our buttons, so they check who is
 * asking themselves.
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

export async function confirmDraft(id: unknown): Promise<DraftActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant") || !can(user, "manageExpenses")) return { ok: false, error: "Your role can't save bookings, payments or fuel." };
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };

  // Take it: one statement, so a double-click (or two tabs) saves it once. Expired or cancelled ones can't be taken.
  const draft = await claimDraft(id, user.id);
  if (!draft) return whyNot(id, user.id);

  // Each kind is checked again with its own page's rules, on the values kept on the server
  const saved =
    draft.kind === "booking"
      ? await saveBooking(draft.fields, user)
      : draft.kind === "payment"
        ? await savePaymentDraft(draft.fields, user)
        : await saveFuelDraft(draft.fields, user);
  if (!saved.ok) {
    await releaseDraft(id); // still pending: the admin can fix what's wrong, or ask again
    return { ok: false, error: `${saved.error} Nothing was saved.` };
  }
  await finishDraft(id, saved.result);
  revalidatePath("/admin/expenses", "layout"); // the Bookings pages show it straight away
  const { result, resultHref } = savedText(draft.kind, draft.fields, saved.result);
  return { ok: true, message: result, href: resultHref };
}

/**
 * Cancel (4.11): the draft can't be confirmed after this, from any tab, and the model is told it was cancelled
 * (afterDraft, 4.7). Only a pending draft can be cancelled: one already saved stays saved.
 */
export async function cancelDraft(id: unknown): Promise<DraftActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant")) return { ok: false, error: "Your role can't cancel drafts." };
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };
  if (await cancelPendingDraft(id, user.id)) return { ok: true, message: "Cancelled. Nothing was saved.", href: "" };
  return whyNot(id, user.id);
}

/** "Saved as VB-0042." and where to see it: the same words on the card after Confirm and when it was saved elsewhere */
function savedText(kind: Draft["kind"], fields: Record<string, string>, result: string): { result: string; resultHref: string } {
  if (kind === "booking") return { result: `Saved as ${result}.`, resultHref: `/admin/expenses/bookings/${result}` };
  if (kind === "payment") {
    const anchor = fields.party === "driver" ? "#driver-payments" : "#customer-payments";
    return { result: `Payment saved on ${result}.`, resultHref: `/admin/expenses/bookings/${result}${anchor}` };
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
  if (draft.status === "confirmed" && draft.result) {
    const done = savedText(draft.kind, draft.fields, draft.result);
    // The card shows what it became ("Saved as VB-0042.", with its link); the message just says why nothing happened
    return { ok: false, error: "This draft was already saved.", card: { status: "confirmed", ...done } };
  }
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
