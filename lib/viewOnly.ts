/**
 * View only: everyone sees the same pages and buttons. What a role can't use is shown greyed out
 * ("locked") instead of hidden; pressing it shows a short message saying why (ViewOnlyGuard).
 * The server still checks every action: this only changes what is shown.
 */

const ASK = "Ask the super admin if you need access.";

/** What a viewer (or an admin, for super-admin-only things) is told when they press something locked */
export const LOCKED = {
  expenses: `Viewers can't add or change anything in the Expense Tracker. ${ASK}`,
  prints: `Viewers can't print, update or delete printout orders. ${ASK}`,
  carBookings: `Viewers can't confirm, reject or change car bookings. ${ASK}`,
  activity: `Viewers can't see the activity log. ${ASK}`,
  users: `Viewers can't see or manage users. ${ASK}`,
  superAdmin: "Only the super admin can add users or reset passwords.",
};

export type LockProps = { "data-locked"?: string; "aria-disabled"?: "true" };

/**
 * Props that lock a button, link, summary or form: lock(!canManage && LOCKED.expenses).
 * Nothing (an empty object) when the user may use it.
 */
export function lock(message: string | false | null | undefined): LockProps {
  return message ? { "data-locked": message, "aria-disabled": "true" } : {};
}
