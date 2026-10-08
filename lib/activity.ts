import { query } from "./db";

/** Dashboard modules; every activity entry belongs to one */
export type ActivityModule = "cars" | "print" | "users" | "expenses";

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
  "vehicle.created": "expenses",
  "vehicle.renamed": "expenses",
  "vehicle.deactivated": "expenses",
  "vehicle.reactivated": "expenses",
  "vehicle.deleted": "expenses",
  "vehicle.emi_updated": "expenses",
  "vehicle.insurance_updated": "expenses",
  "driver.created": "expenses",
  "driver.updated": "expenses",
  "driver.deactivated": "expenses",
  "driver.reactivated": "expenses",
  "driver.deleted": "expenses",
  "trip.created": "expenses",
  "trip.updated": "expenses",
  "trip.readings_updated": "expenses",
  "trip.cancelled": "expenses",
  "trip.restored": "expenses",
  "payment.received": "expenses",
  "payment.driver_paid": "expenses",
  "payment.removed": "expenses",
  "expense.fuel_added": "expenses",
  "expense.repair_added": "expenses",
  "expense.removed": "expenses",
  "expense.emi_paid": "expenses",
  "expense.insurance_paid": "expenses",
  "report.downloaded": "expenses",
  "trip.statement_downloaded": "expenses",
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
 * The activity page of a module (Car Bookings, Printout or Expense Tracker). Team changes (users and passwords)
 * are shown on both: "all" is the module plus team changes, "users" is team changes only.
 */
export type ActivityFilter = "all" | "module" | "users";

/** One page of a module's activity, newest first, with the total number of entries */
export async function listActivity(
  module: Exclude<ActivityModule, "users">,
  filter: ActivityFilter,
  { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {},
): Promise<{ rows: ActivityRow[]; total: number }> {
  const modules = filter === "module" ? [module] : filter === "users" ? ["users"] : [module, "users"];
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM activity_log WHERE module = ANY($1)`,
    [modules],
  );
  const rows = await query<ActivityRow>(
    `SELECT id::int AS id,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'FMDay, DD Mon YYYY') AS day,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS time,
            actor_name, actor_mobile, action, module, target, details
     FROM activity_log
     WHERE module = ANY($1)
     ORDER BY at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [modules, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { rows, total };
}

export type TargetActivityRow = ActivityRow & { at_ist: string };

/** Everything recorded about one item, e.g. a booking ("VB-0004"), oldest first */
export async function listTargetActivity(module: ActivityModule, target: string, limit = 100): Promise<TargetActivityRow[]> {
  return query<TargetActivityRow>(
    `SELECT id::int AS id,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'FMDay, DD Mon YYYY') AS day,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS time,
            to_char(at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS at_ist,
            actor_name, actor_mobile, action, module, target, details
     FROM activity_log
     WHERE module = $1 AND target = $2
     ORDER BY at, id
     LIMIT $3`,
    [module, target, limit],
  );
}
