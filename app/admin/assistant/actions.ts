"use server";

import { revalidatePath } from "next/cache";
import { can, currentUser, type SessionUser } from "@/lib/auth";
import { claimDraft, finishDraft, getDraft, releaseDraft } from "@/lib/assistant/draftStore";
import { FUEL_PROBLEMS, parseFuel, saveFuel } from "@/lib/expenses/fuelInput";
import { parsePayment, PAYMENT_PROBLEMS, savePayment } from "@/lib/expenses/paymentInput";
import { checkTrip, createCheckedTrip, fromObject, parseTrip } from "@/lib/expenses/tripInput";
import { getTripById } from "@/lib/expenses/trips";

/**
 * Annapurna Assist's Confirm button (4.6). The browser sends only the draft's id: the values to save come from the
 * server (assistant_drafts, 4.5), for the signed-in admin only, and are checked again with the booking form's
 * rules, because things change after the draft was made (the vehicle may have been booked meanwhile).
 *
 * Like every server action, this can be called by a direct POST, not just from our button, so it checks who is
 * asking itself.
 */

export type ConfirmResult =
  | {
      ok: true;
      /** What it became, kept on the draft: the new booking "VB-0042", or the booking or vehicle it went on */
      result: string;
      href: string;
      /** For the card: "Saved as VB-0042." */
      message: string;
    }
  | { ok: false; error: string };

type Saved = ConfirmResult;

export async function confirmDraft(id: unknown): Promise<ConfirmResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant") || !can(user, "manageExpenses")) return { ok: false, error: "Your role can't save bookings, payments or fuel." };
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };

  // Take it: one statement, so a double-click (or two tabs) saves it once
  const draft = await claimDraft(id, user.id);
  if (!draft) return { ok: false, error: await whyNot(id, user.id) };

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
  return saved;
}

/** A booking draft: the booking form's checks again, then saved and logged exactly like one from the form */
async function saveBooking(fields: Record<string, string>, user: SessionUser): Promise<Saved> {
  const parsed = parseTrip(fromObject(fields), true);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const check = await checkTrip(parsed.input, { allowDriverClash: fields.allow_driver_clash === "1" });
  if (!check.ok) return { ok: false, error: "driverClash" in check ? check.driverClash : check.error };
  const saved = await createCheckedTrip(parsed, check, user, "via Annapurna Assist");
  if (!saved.ok) return saved;
  return { ok: true, result: saved.tripNo, href: `/admin/expenses/bookings/${saved.tripNo}`, message: `Saved as ${saved.tripNo}.` };
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
  const anchor = parsed.payment.party === "driver" ? "#driver-payments" : "#customer-payments";
  return { ok: true, result: trip.trip_no, href: `/admin/expenses/bookings/${trip.trip_no}${anchor}`, message: `Payment saved on ${trip.trip_no}.` };
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
  return saved.trip_no
    ? { ok: true, result: saved.trip_no, href: `/admin/expenses/bookings/${saved.trip_no}#fuel`, message: `Fuel saved on ${saved.trip_no}.` }
    : { ok: true, result: saved.vehicle_name, href: `/admin/expenses/fleet/${fields.vehicle_id}#fuel`, message: `Fuel saved for ${saved.vehicle_name}.` };
}

/** Why a draft couldn't be taken, in words for the admin */
async function whyNot(id: string, userId: number): Promise<string> {
  const draft = await getDraft(id, userId);
  if (!draft) return "This draft wasn't found.";
  if (draft.status === "confirmed") {
    return draft.result ? `Already saved ${draft.kind === "booking" ? "as" : "on"} ${draft.result}.` : "It's being saved already.";
  }
  if (draft.status === "cancelled") return "This draft was cancelled. Ask again for a new one.";
  return "This draft has expired (drafts last 24 hours). Ask again for a new one.";
}
