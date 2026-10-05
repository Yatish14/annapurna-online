"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { changeStatus, getBooking, recordNotification, type Booking } from "@/lib/bookings";
import { CARS, passengersText } from "@/lib/config";
import { fmtRange } from "@/lib/dates";
import { notifyConfirmed, notifyUnavailable } from "@/lib/whatsapp/notify";
import { safeBack, withFlash } from "./filters";

/** Sends the booked / not-available WhatsApp message; returns the error text if it failed */
async function notifyCustomer(b: Booking): Promise<string | null> {
  try {
    await (b.status === "confirmed" ? notifyConfirmed(b) : notifyUnavailable(b));
    await recordNotification(b.id, null);
    return null;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    console.error(`WhatsApp message for ${b.ref} failed:`, message);
    await recordNotification(b.id, message);
    return message;
  }
}

const ACTIONS = { book: "confirmed", reject: "rejected", cancel: "cancelled" } as const;

/** "Kia Carens · 12 Oct – 13 Oct 2026 · 5 adults · Ravi" for the activity log */
function summary(b: Booking): string {
  return [CARS[b.car].name, fmtRange(b.start_date, b.end_date), passengersText(b.adults, b.children), b.customer_name]
    .filter(Boolean)
    .join(" · ");
}

export async function updateBooking(formData: FormData) {
  const user = await requireUser("manageBookings");
  const back = safeBack(formData.get("back"));

  const id = Number(formData.get("id"));
  const action = String(formData.get("action")) as keyof typeof ACTIONS;
  const to = ACTIONS[action];
  if (!Number.isInteger(id) || !to) redirect(withFlash(back, "invalid"));

  const result = await changeStatus(id, to, user.name);
  if (!result.ok) redirect(withFlash(back, result.reason));

  const booking = result.booking;
  let flash: string = to;
  // Cancelling is followed up by phone, so only bookings and rejections are messaged.
  // Test data is never messaged (its numbers may belong to real people).
  const message = to !== "cancelled" && !booking.is_sample;
  const sendError = message ? await notifyCustomer(booking) : null;
  if (sendError) flash += "-unsent";
  else if (booking.is_sample && to !== "cancelled") flash += "-sample";

  await logActivity(
    user,
    `booking.${to}`,
    booking.ref,
    [
      summary(booking),
      sendError ? `WhatsApp message failed: ${sendError}` : null,
      booking.is_sample ? "test data, no message sent" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  revalidatePath("/admin", "layout");
  redirect(withFlash(back, flash, booking.ref));
}

export async function resendMessage(formData: FormData) {
  const user = await requireUser("manageBookings");
  const back = safeBack(formData.get("back"));

  const booking = await getBooking(Number(formData.get("id")));
  if (!booking || (booking.status !== "confirmed" && booking.status !== "rejected")) {
    redirect(withFlash(back, "invalid"));
  }

  const failed = await notifyCustomer(booking);
  await logActivity(user, "booking.message_resent", booking.ref, failed ? `Failed again: ${failed}` : "Sent");
  revalidatePath("/admin", "layout");
  redirect(withFlash(back, failed ? "resend-failed" : "resent", booking.ref));
}
