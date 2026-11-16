"use server";

import { revalidatePath } from "next/cache";
import { can, currentUser } from "@/lib/auth";
import { claimDraft, finishDraft, getDraft, releaseDraft } from "@/lib/assistant/draftStore";
import { checkTrip, createCheckedTrip, fromObject, parseTrip } from "@/lib/expenses/tripInput";

/**
 * Annapurna Assist's Confirm button (4.6). The browser sends only the draft's id: the values to save come from the
 * server (assistant_drafts, 4.5), for the signed-in admin only, and are checked again with the booking form's
 * rules, because things change after the draft was made (the vehicle may have been booked meanwhile).
 *
 * Like every server action, this can be called by a direct POST, not just from our button, so it checks who is
 * asking itself.
 */

export type ConfirmResult =
  | { ok: true; /** "VB-0042" */ tripNo: string; href: string }
  | { ok: false; error: string };

export async function confirmDraft(id: unknown): Promise<ConfirmResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!can(user, "useAssistant") || !can(user, "manageExpenses")) return { ok: false, error: "Your role can't save bookings." };
  if (typeof id !== "string") return { ok: false, error: "This draft wasn't found." };

  // Take it: one statement, so a double-click (or two tabs) saves it once
  const draft = await claimDraft(id, user.id);
  if (!draft) return { ok: false, error: await whyNot(id, user.id) };
  if (draft.kind !== "booking") {
    await releaseDraft(id);
    return { ok: false, error: "Only booking drafts can be confirmed so far." };
  }

  // The booking form's checks again, on the values kept on the server
  const fail = async (error: string): Promise<ConfirmResult> => {
    await releaseDraft(id); // still pending: the admin can fix it in the form, or ask again
    return { ok: false, error };
  };
  const parsed = parseTrip(fromObject(draft.fields), true);
  if (!parsed.ok) return fail(parsed.error);
  const check = await checkTrip(parsed.input, { allowDriverClash: draft.fields.allow_driver_clash === "1" });
  if (!check.ok) return fail("driverClash" in check ? `${check.driverClash} Nothing was saved.` : `${check.error} Nothing was saved.`);

  // Saved and logged exactly like a booking from the form, plus where it came from
  const saved = await createCheckedTrip(parsed, check, user, "via Annapurna Assist");
  if (!saved.ok) return fail(`${saved.error} Nothing was saved.`);
  await finishDraft(id, saved.tripNo);
  revalidatePath("/admin/expenses", "layout"); // the Bookings pages show it straight away
  return { ok: true, tripNo: saved.tripNo, href: `/admin/expenses/bookings/${saved.tripNo}` };
}

/** Why a draft couldn't be taken, in words for the admin */
async function whyNot(id: string, userId: number): Promise<string> {
  const draft = await getDraft(id, userId);
  if (!draft) return "This draft wasn't found.";
  if (draft.status === "confirmed") return draft.result ? `Already saved as ${draft.result}.` : "It's being saved already.";
  if (draft.status === "cancelled") return "This draft was cancelled. Ask again for a new one.";
  return "This draft has expired (drafts last 24 hours). Ask again for a new one.";
}
