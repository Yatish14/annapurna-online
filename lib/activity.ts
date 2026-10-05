import { query } from "./db";

export type ActivityAction =
  | "enquiry.created"
  | "booking.confirmed"
  | "booking.rejected"
  | "booking.cancelled"
  | "booking.message_resent"
  | "user.created"
  | "user.deleted"
  | "user.password_reset"
  | "user.password_changed";

export type Actor = { name: string; mobile: string | null };

export type ActivityRow = {
  id: number;
  day: string;
  time: string;
  actor_name: string;
  actor_mobile: string | null;
  action: ActivityAction;
  target: string | null;
  details: string | null;
};

/** Records who did what. Never throws: a failed log entry must not undo the action itself. */
export async function logActivity(actor: Actor, action: ActivityAction, target: string | null, details?: string) {
  try {
    await query(
      `INSERT INTO activity_log (actor_name, actor_mobile, action, target, details) VALUES ($1, $2, $3, $4, $5)`,
      [actor.name, actor.mobile, action, target, details ?? null],
    );
  } catch (err) {
    console.error(`Could not record activity ${action} ${target ?? ""}:`, err);
  }
}

export type ActivityFilter = "all" | "bookings" | "users";

export async function listActivity(filter: ActivityFilter, limit = 200): Promise<ActivityRow[]> {
  const where =
    filter === "bookings"
      ? `WHERE action LIKE 'booking.%' OR action LIKE 'enquiry.%'`
      : filter === "users"
        ? `WHERE action LIKE 'user.%'`
        : "";
  return query<ActivityRow>(
    `SELECT id::int AS id,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'FMDay, DD Mon YYYY') AS day,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS time,
            actor_name, actor_mobile, action, target, details
     FROM activity_log ${where}
     ORDER BY at DESC, id DESC
     LIMIT $1`,
    [limit],
  );
}
