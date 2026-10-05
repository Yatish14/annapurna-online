import { BOOKING_RULES, type CarId } from "../config";
import { query } from "../db";

/** What the customer has chosen so far in the booking conversation */
export type Draft = {
  car?: CarId;
  adults?: number;
  children?: number;
  start?: string;
  days?: number;
  pickup?: string;
};

export type Step = "car" | "adults" | "children" | "date" | "days" | "pickup" | "confirm";

export type Session = { step: Step; draft: Draft };

/** The customer's unfinished booking, or null if there is none or it timed out */
export async function getSession(phone: string): Promise<Session | null> {
  const [row] = await query<{ step: Step; data: Draft }>(
    `SELECT step, data FROM wa_sessions
     WHERE phone = $1 AND updated_at > now() - make_interval(mins => $2)`,
    [phone, BOOKING_RULES.sessionTimeoutMinutes],
  );
  return row ? { step: row.step, draft: row.data ?? {} } : null;
}

export async function saveSession(phone: string, step: Step, draft: Draft): Promise<void> {
  await query(
    `INSERT INTO wa_sessions (phone, step, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (phone) DO UPDATE SET step = EXCLUDED.step, data = EXCLUDED.data, updated_at = now()`,
    [phone, step, JSON.stringify(draft)],
  );
}

export async function clearSession(phone: string): Promise<void> {
  await query(`DELETE FROM wa_sessions WHERE phone = $1`, [phone]);
}

/**
 * Removes the session only if it is at `step`, returning whether it did.
 * Used on "Confirm" so a double tap can't create two enquiries.
 */
export async function claimSession(phone: string, step: Step): Promise<boolean> {
  const rows = await query(`DELETE FROM wa_sessions WHERE phone = $1 AND step = $2 RETURNING phone`, [phone, step]);
  return rows.length > 0;
}

/** True the first time a message ID is seen; false for duplicates Meta re-delivers */
export async function claimMessage(messageId: string): Promise<boolean> {
  const rows = await query(
    `INSERT INTO processed_messages (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [messageId],
  );
  return rows.length > 0;
}
