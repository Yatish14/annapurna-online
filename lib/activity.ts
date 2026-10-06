import { query } from "./db";

/** Dashboard modules; every activity entry belongs to one */
export type ActivityModule = "cars" | "print" | "users";

const ACTION_MODULES = {
  "enquiry.created": "cars",
  "booking.confirmed": "cars",
  "booking.rejected": "cars",
  "booking.cancelled": "cars",
  "booking.message_resent": "cars",
  "order.created": "print",
  "order.file_printed": "print",
  "order.collected": "print",
  "order.reopened": "print",
  "order.files_deleted": "print",
  "print.uploads_paused": "print",
  "print.uploads_resumed": "print",
  "print.files_deleted": "print",
  "user.created": "users",
  "user.deleted": "users",
  "user.password_reset": "users",
  "user.password_changed": "users",
} satisfies Record<string, ActivityModule>;

export type ActivityAction = keyof typeof ACTION_MODULES;

export type Actor = { name: string; mobile: string | null };

/** Customers and scheduled jobs, for entries not made by a dashboard user */
export const SYSTEM_ACTOR: Actor = { name: "System", mobile: null };

export type ActivityRow = {
  id: number;
  day: string;
  time: string;
  actor_name: string;
  actor_mobile: string | null;
  action: ActivityAction;
  module: ActivityModule;
  target: string | null;
  details: string | null;
};

/** Records who did what. Never throws: a failed log entry must not undo the action itself. */
export async function logActivity(actor: Actor, action: ActivityAction, target: string | null, details?: string) {
  try {
    await query(
      `INSERT INTO activity_log (actor_name, actor_mobile, action, module, target, details) VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor.name, actor.mobile, action, ACTION_MODULES[action], target, details ?? null],
    );
  } catch (err) {
    console.error(`Could not record activity ${action} ${target ?? ""}:`, err);
  }
}

/**
 * The activity page of a module (Car Bookings or Printout). Team changes (users and passwords)
 * are shown on both: "all" is the module plus team changes, "users" is team changes only.
 */
export type ActivityFilter = "all" | "module" | "users";

export async function listActivity(
  module: Exclude<ActivityModule, "users">,
  filter: ActivityFilter,
  limit = 200,
): Promise<ActivityRow[]> {
  const modules = filter === "module" ? [module] : filter === "users" ? ["users"] : [module, "users"];
  return query<ActivityRow>(
    `SELECT id::int AS id,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'FMDay, DD Mon YYYY') AS day,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS time,
            actor_name, actor_mobile, action, module, target, details
     FROM activity_log
     WHERE module = ANY($1)
     ORDER BY at DESC, id DESC
     LIMIT $2`,
    [modules, limit],
  );
}
