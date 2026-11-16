import { query } from "@/lib/db";

/**
 * Drafts the assistant prepared, kept on the server (the assistant_drafts table, db/schema.sql). Server only.
 *
 * Never trust data from the browser: the chat's card shows the details, but it carries only the draft's id. When
 * the admin presses Confirm (4.6), the server loads the values from here, for that admin only, and checks them
 * again before saving. So editing the page, or sending a made-up request, can't change what gets saved, and an
 * admin can't confirm someone else's draft.
 */

export type DraftKind = "booking" | "payment" | "fuel";

/** How long a draft can be confirmed. Confirm checks everything again anyway; this keeps old drafts from lingering. */
export const DRAFT_HOURS = 24;

export type Draft = {
  id: string;
  kind: DraftKind;
  /** The checked values by the form's field names */
  fields: Record<string, string>;
  status: "pending" | "confirmed" | "cancelled";
  /** Past its expiry time (still loaded, so the admin can be told why it can't be confirmed) */
  expired: boolean;
  result: string | null;
};

/** Keeps a checked draft for this admin. Returns its id, the only thing the card gets. */
export async function saveDraft(userId: number, kind: DraftKind, fields: Record<string, string>): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO assistant_drafts (user_id, kind, fields, expires_at)
     VALUES ($1, $2, $3::jsonb, now() + make_interval(hours => $4))
     RETURNING id`,
    [userId, kind, JSON.stringify(fields), DRAFT_HOURS],
  );
  return row.id;
}

/** What a draft id looks like (a UUID). Anything else from the browser is turned away before it reaches the database. */
const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One of this admin's drafts, or null. Another admin's draft is null too, the same as one that doesn't exist,
 * so trying ids tells nobody which ones are real.
 */
export async function getDraft(id: string, userId: number): Promise<Draft | null> {
  if (!DRAFT_ID.test(id)) return null;
  const [row] = await query<Draft>(
    `SELECT id, kind, fields, status, expires_at <= now() AS expired, result
     FROM assistant_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return row ?? null;
}

/**
 * Takes a draft for confirming: pending → confirmed, only if it's this admin's, still pending and not expired. One
 * statement, so of two Confirm clicks at the same moment (a double-click, two tabs) only one gets the values back;
 * the other gets null. Returns the checked values to save.
 */
export async function claimDraft(id: string, userId: number): Promise<{ kind: DraftKind; fields: Record<string, string> } | null> {
  if (!DRAFT_ID.test(id)) return null;
  const [row] = await query<{ kind: DraftKind; fields: Record<string, string> }>(
    `UPDATE assistant_drafts SET status = 'confirmed', settled_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()
     RETURNING kind, fields`,
    [id, userId],
  );
  return row ?? null;
}

/** After a claimed draft was saved: what it became, e.g. "VB-0042" */
export async function finishDraft(id: string, result: string): Promise<void> {
  await query(`UPDATE assistant_drafts SET result = $2 WHERE id = $1 AND status = 'confirmed'`, [id, result]);
}

/** A claimed draft that couldn't be saved (e.g. the vehicle was booked meanwhile) goes back to pending */
export async function releaseDraft(id: string): Promise<void> {
  await query(`UPDATE assistant_drafts SET status = 'pending', settled_at = NULL WHERE id = $1 AND status = 'confirmed' AND result IS NULL`, [id]);
}

/** At most this many draft ids are looked up for one question's history (the browser could send any number) */
const MAX_HISTORY_DRAFTS = 20;

/**
 * This admin's drafts among the ids the chat history mentions (4.7). Ids that aren't drafts, or are another admin's,
 * are simply left out. One query for the whole history.
 */
export async function draftsOf(ids: string[], userId: number): Promise<Map<string, Draft>> {
  const valid = [...new Set(ids.filter((id) => DRAFT_ID.test(id)))].slice(0, MAX_HISTORY_DRAFTS);
  if (!valid.length) return new Map();
  const rows = await query<Draft>(
    `SELECT id, kind, fields, status, expires_at <= now() AS expired, result
     FROM assistant_drafts WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [valid, userId],
  );
  return new Map(rows.map((d) => [d.id, d]));
}

const KIND_NAMES: Record<DraftKind, string> = { booking: "booking", payment: "payment", fuel: "fuel entry" };

/**
 * What became of a draft after the answer that showed it, for the model to read with that answer (4.7). Written by
 * the server from the database, so the browser can't make the model believe something was saved.
 */
export function afterDraft(d: Draft): string {
  const what = `the ${KIND_NAMES[d.kind]} draft`;
  if (d.status === "confirmed") {
    return d.result
      ? `[After this answer: the admin pressed Confirm and ${what} was saved as ${d.result}.]`
      : `[After this answer: the admin pressed Confirm and ${what} is being saved.]`;
  }
  if (d.status === "cancelled") return `[After this answer: the admin cancelled ${what}. Nothing was saved.]`;
  if (d.expired) return `[After this answer: ${what} expired without being confirmed. Nothing was saved.]`;
  return `[After this answer: ${what} is still waiting for the admin's Confirm. Nothing is saved yet.]`;
}
