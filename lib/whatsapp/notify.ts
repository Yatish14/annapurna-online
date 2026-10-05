// Messages sent to the customer when the admin confirms or rejects an enquiry.

import type { Booking } from "../bookings";
import { BUSINESS, CARS, passengersText } from "../config";
import { daysText, diffDays, fmtRange } from "../dates";
import { sendTemplate, sendText } from "./client";

function tripDates(b: Booking): string {
  return `${fmtRange(b.start_date, b.end_date)} (${daysText(diffDays(b.start_date, b.end_date) + 1)})`;
}

const firstName = (b: Booking) => b.customer_name?.trim() || "Customer";

/** Sample numbers may belong to real people, so test data is never messaged */
function refuseSample(b: Booking) {
  if (b.is_sample) throw new Error("Test data: WhatsApp messages are never sent for sample bookings");
}

/*
 * Each message is first sent as an approved template (works any time).
 * If the template fails — e.g. not approved yet — a plain message is tried instead,
 * which WhatsApp only delivers within 24 hours of the customer's last message.
 * Template wording to submit in WhatsApp Manager is in README.md.
 */
async function sendWithFallback(to: string, template: string, params: string[], fallbackText: string) {
  try {
    await sendTemplate(to, template, params);
  } catch (templateErr) {
    try {
      await sendText(to, fallbackText);
    } catch {
      throw templateErr;
    }
  }
}

export async function notifyConfirmed(b: Booking) {
  refuseSample(b);
  const car = CARS[b.car].name;
  const passengers = passengersText(b.adults, b.children);
  return sendWithFallback(
    b.phone,
    process.env.WHATSAPP_TEMPLATE_CONFIRMED || "booking_confirmed",
    [firstName(b), b.ref, car, tripDates(b), passengers, b.pickup_location],
    [
      `🎉 *Your car is booked!*`,
      ``,
      `Ref: *${b.ref}*`,
      `🚙 ${car} with driver`,
      `📅 ${tripDates(b)}`,
      `👥 ${passengers}`,
      `📍 Pickup: ${b.pickup_location}`,
      ``,
      `Our team will contact you before your trip. For any help, call ${BUSINESS.phoneDisplay}.`,
      `Thank you for choosing Annapurna! 🙏`,
    ].join("\n"),
  );
}

export async function notifyUnavailable(b: Booking) {
  refuseSample(b);
  const car = CARS[b.car].name;
  return sendWithFallback(
    b.phone,
    process.env.WHATSAPP_TEMPLATE_UNAVAILABLE || "booking_unavailable",
    [firstName(b), car, tripDates(b), b.ref],
    [
      `😔 Sorry ${firstName(b)}, the ${car} is not available for ${tripDates(b)} (Ref: ${b.ref}).`,
      ``,
      `Reply *menu* to choose other dates, or call ${BUSINESS.phoneDisplay} for help.`,
    ].join("\n"),
  );
}
