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

export default function Flash({ params }: { params: URLSearchParams }) {
  const flash = FLASH[params.get("flash") ?? ""];
  if (!flash) return null;
  const detail = (params.get("ref") ?? "").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 60);
  return (
    <p className={`ad-alert ad-alert-${flash.tone}`} role="status">
      {flash.text(detail)}
    </p>
  );
}
