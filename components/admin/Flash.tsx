import FloatingFlash from "./FloatingFlash";

type Tone = "ok" | "warn" | "error";

// Messages shown after an action, chosen by ?flash=… ("d" is the booking ref or user name)
const FLASH: Record<string, { tone: Tone; text: (d: string) => string }> = {
  confirmed: { tone: "ok", text: (d) => `${d} marked as booked. The customer has been sent the confirmation on WhatsApp.` },
  "confirmed-unsent": { tone: "warn", text: (d) => `${d} is booked, but the WhatsApp message could not be sent. See the error on the booking and try "Resend message".` },
  rejected: { tone: "ok", text: (d) => `${d} rejected. The customer has been told the car isn't available.` },
  "rejected-unsent": { tone: "warn", text: (d) => `${d} rejected, but the WhatsApp message could not be sent. See the error on the enquiry.` },
  "confirmed-sample": { tone: "ok", text: (d) => `${d} marked as booked. It's test data, so no WhatsApp message was sent.` },
  "rejected-sample": { tone: "ok", text: (d) => `${d} rejected. It's test data, so no WhatsApp message was sent.` },
  cancelled: { tone: "ok", text: (d) => `${d} cancelled and its dates are free again. The customer was not messaged, so please call them.` },
  resent: { tone: "ok", text: (d) => `WhatsApp message for ${d} sent.` },
  "resend-failed": { tone: "error", text: (d) => `WhatsApp message for ${d} failed again. See the error on the booking.` },
  conflict: { tone: "error", text: () => "Couldn't mark as booked: those dates overlap another confirmed booking for the same car." },
  "not-found": { tone: "warn", text: () => "That item was already changed by someone else. The page is now up to date." },
  invalid: { tone: "error", text: () => "That action isn't allowed here." },
  forbidden: { tone: "error", text: () => "Your role doesn't allow that. Ask the super admin if you need access." },

  "order-collected": { tone: "ok", text: (d) => `${d} marked as collected.` },
  "order-reopened": { tone: "ok", text: (d) => `${d} moved back from collected.` },
  "files-deleted": { tone: "ok", text: (d) => `The files of ${d} were deleted from storage.` },
  "uploads-paused": { tone: "warn", text: () => "Customer uploads are paused. The print page now asks customers to come to the counter." },
  "uploads-resumed": { tone: "ok", text: () => "Customer uploads are on again." },

  "trip-created": { tone: "ok", text: (d) => `Booking ${d} created.` },
  "trip-updated": { tone: "ok", text: (d) => `${d} updated. The changes are in its history below.` },
  "trip-unchanged": { tone: "warn", text: () => "Nothing was changed." },
  "readings-saved": { tone: "ok", text: () => "Readings and amounts saved." },
  "trip-cancelled": { tone: "ok", text: (d) => `${d} cancelled. The vehicle is free on those days again.` },
  "trip-restored": { tone: "ok", text: (d) => `${d} is active again.` },
  "restore-busy": { tone: "error", text: (d) => `Can't restore it: the vehicle has another booking on those days${d ? ` (${d})` : ""}.` },
  "trip-not-active": { tone: "error", text: () => "This booking is cancelled. Restore it first to add payments or costs." },
  "payment-added": { tone: "ok", text: (d) => `Payment of ${d} from the customer recorded.` },
  "driver-paid": { tone: "ok", text: (d) => `Payment of ${d} to the driver recorded.` },
  "payment-removed": { tone: "ok", text: () => "Payment removed. It stays in the list, crossed out." },
  "fuel-added": { tone: "ok", text: (d) => `Fuel added for ${d}.` },
  "repair-added": { tone: "ok", text: (d) => `Repair added for ${d}.` },
  "expense-removed": { tone: "ok", text: () => "Entry removed. It stays in the list, crossed out." },
  "amount-invalid": { tone: "error", text: () => "Enter amounts in rupees, like 2500 or 2500.50 (up to ₹1 crore)." },
  "litres-invalid": { tone: "error", text: () => "Enter the litres as a number, like 35 or 35.5 (or leave it empty)." },
  "paid-at-invalid": { tone: "error", text: () => "Choose when the payment was made (it can't be in the future)." },
  "date-invalid": { tone: "error", text: () => "Choose a valid date." },
  "odometer-invalid": { tone: "error", text: () => "Odometer readings should be whole numbers of km, like 45120." },
  "odometer-start-missing": { tone: "error", text: () => "Enter the odometer reading at the start as well as at the end." },
  "odometer-order": { tone: "error", text: () => "The odometer reading at the end can't be lower than at the start." },
  "repair-what": { tone: "error", text: () => "Say what was repaired, like “Engine oil change” or “Front tyre”." },
  "shop-city": { tone: "error", text: () => "Choose or type the city of the shop, or clear the state." },
  "vehicle-added": { tone: "ok", text: (d) => `${d} added. It can now be picked for bookings.` },
  "vehicle-renamed": { tone: "ok", text: (d) => `Vehicle renamed to ${d}.` },
  "vehicle-exists": { tone: "error", text: (d) => `There is already a vehicle called ${d}.` },
  "vehicle-name": { tone: "error", text: () => "Enter a vehicle name between 2 and 60 characters." },
  "vehicle-off": { tone: "ok", text: (d) => `${d} switched off. It can't be picked for new bookings; its history is kept.` },
  "vehicle-on": { tone: "ok", text: (d) => `${d} can be booked again.` },
  "vehicle-deleted": { tone: "ok", text: (d) => `${d} deleted.` },
  "vehicle-in-use": { tone: "error", text: (d) => `${d} has bookings or costs, so it can't be deleted. Switch it off instead.` },
  "driver-added": { tone: "ok", text: (d) => `${d} added. They can now be picked for bookings.` },
  "driver-updated": { tone: "ok", text: (d) => `${d}'s details saved.` },
  "driver-exists": { tone: "error", text: () => "A driver with that mobile number already exists." },
  "driver-name": { tone: "error", text: () => "Enter a driver name between 2 and 60 characters." },
  "driver-off": { tone: "ok", text: (d) => `${d} switched off. They can't be picked for new bookings; their history is kept.` },
  "driver-on": { tone: "ok", text: (d) => `${d} can be picked for bookings again.` },
  "driver-deleted": { tone: "ok", text: (d) => `${d} deleted.` },
  "driver-in-use": { tone: "error", text: (d) => `${d} has bookings, so they can't be deleted. Switch them off instead.` },

  "user-created": { tone: "ok", text: (d) => `${d} can now sign in with their mobile number and the password you set.` },
  "user-deleted": { tone: "ok", text: (d) => `${d} was removed and signed out.` },
  "password-reset": { tone: "ok", text: (d) => `Password changed for ${d}. They have been signed out everywhere.` },
  "user-exists": { tone: "error", text: () => "A user with that mobile number already exists." },
  "user-protected": { tone: "error", text: () => "The super admin can't be removed." },
  "password-changed": { tone: "ok", text: () => "Your password has been changed. Other devices have been signed out." },
  "wrong-password": { tone: "error", text: () => "Your current password is incorrect." },
  "password-mismatch": { tone: "error", text: () => "The new passwords don't match." },
  "user-mobile": { tone: "error", text: () => "Enter a valid 10-digit Indian mobile number." },
  "user-name": { tone: "error", text: () => "Enter a name between 2 and 60 characters." },
  "user-password": { tone: "error", text: () => "Passwords must be at least 8 characters." },
  "user-self": { tone: "error", text: () => "You can't remove yourself." },
};

/**
 * The message after an action. `floating`: stays at the top of the screen while scrolling (for pages that
 * return to a section further down, e.g. after adding a payment); success messages then fade.
 */
export default function Flash({ params, floating = false }: { params: URLSearchParams; floating?: boolean }) {
  const flash = FLASH[params.get("flash") ?? ""];
  if (!flash) return null;
  const detail = (params.get("ref") ?? "").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 60);
  const message = (
    <p className={`ap-alert ap-alert-${flash.tone}`} role="status">
      {flash.text(detail)}
    </p>
  );
  return floating ? (
    <FloatingFlash key={params.toString()} tone={flash.tone}>
      {message}
    </FloatingFlash>
  ) : (
    message
  );
}
