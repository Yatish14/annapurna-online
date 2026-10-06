import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { query } from "../db";
import type { ColorMode, Sides } from "./files";

export type PrintStatus = "new" | "printed" | "collected";

export type PrintFile = {
  id: number;
  order_id: number;
  position: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  color: ColorMode;
  sides: Sides;
  copies: number;
  page_range: string | null;
  printed_count: number;
  printed_ist: string | null;
  printed_by: string | null;
  deleted: boolean;
};

export type PrintOrder = {
  id: number;
  order_no: string;
  public_id: string;
  customer_name: string | null;
  phone: string | null;
  status: PrintStatus;
  created_ist: string;
  /** Milliseconds since 1970, for "5 min ago" */
  created_ms: number;
  updated_ist: string | null;
  updated_by: string | null;
  files: PrintFile[];
};

// Abuse protection for the public upload page. Customers on the shop's Wi-Fi or the same
// mobile network can share one IP address, so the per-network limits are generous.
const LIMITS = {
  uploadsPerNetworkPerHour: 60,
  ordersPerNetworkPerHour: 20,
  /** Keeps the free storage plan's monthly upload allowance safe */
  uploadsPerDay: 300,
  /** An upload slot must be used (uploaded and the order sent) within this long */
  slotMinutes: 120,
};

/** Keyed hash of an IP address: enough to count uploads per network, without storing the address */
export function hashIp(ip: string): string {
  const secret = process.env.SESSION_SECRET || "annapurna-dev";
  return createHmac("sha256", secret).update(`print-ip:${ip}`).digest("hex").slice(0, 32);
}

// ---------- Settings ----------

const ACCEPTING_KEY = "print.accepting";

/** Whether the public page accepts new uploads (the shop can pause it, e.g. when closed) */
export async function isAccepting(): Promise<boolean> {
  const [row] = await query<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [ACCEPTING_KEY]);
  return row?.value !== "off";
}

export async function setAccepting(on: boolean, by: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [ACCEPTING_KEY, on ? "on" : "off", by],
  );
}

// ---------- Customer uploads ----------

export type SlotRequest = { ext: string; contentType: string };

/**
 * Hands out storage keys for the files a customer is about to upload.
 * Returns null when this network (or the whole shop, for the day) has uploaded too much.
 */
export async function reserveSlots(files: SlotRequest[], ipHash: string): Promise<string[] | null> {
  const [counts] = await query<{ network: number; today: number }>(
    `SELECT count(*) FILTER (WHERE ip_hash = $1 AND created_at > now() - interval '1 hour')::int AS network,
            count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today
     FROM print_uploads WHERE created_at > now() - interval '1 day'`,
    [ipHash],
  );
  if (counts.network + files.length > LIMITS.uploadsPerNetworkPerHour) return null;
  if (counts.today + files.length > LIMITS.uploadsPerDay) return null;

  const keys = files.map((f) => `print/${randomBytes(16).toString("hex")}.${f.ext}`);
  await query(
    `INSERT INTO print_uploads (storage_key, content_type, ip_hash)
     SELECT * FROM unnest($1::text[], $2::text[], array_fill($3::text, ARRAY[$4::int]))`,
    [keys, files.map((f) => f.contentType), ipHash, files.length],
  );
  return keys;
}

export type Slot = { storage_key: string; content_type: string; used: boolean; expired: boolean };

export async function getSlot(key: string): Promise<Slot | null> {
  const [slot] = await query<Slot>(
    `SELECT storage_key, content_type, order_id IS NOT NULL AS used,
            (deleted_at IS NOT NULL OR created_at < now() - make_interval(mins => $2)) AS expired
     FROM print_uploads WHERE storage_key = $1`,
    [key, LIMITS.slotMinutes],
  );
  return slot ?? null;
}

export async function tooManyOrders(ipHash: string): Promise<boolean> {
  const [row] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM print_orders WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  return row.n >= LIMITS.ordersPerNetworkPerHour;
}

export type NewFile = {
  storage_key: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  color: ColorMode;
  sides: Sides;
  copies: number;
  page_range: string | null;
};

/** Saves an order and its files in one statement (all or nothing) */
export async function createOrder(input: {
  customerName: string | null;
  phone: string | null;
  ipHash: string;
  files: NewFile[];
}): Promise<{ order_no: string; public_id: string }> {
  const publicId = randomBytes(16).toString("hex");
  const files = input.files.map((f, i) => ({ ...f, position: i + 1 }));
  const [row] = await query<{ order_no: string; public_id: string }>(
    `WITH o AS (
       INSERT INTO print_orders (public_id, customer_name, phone, ip_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, order_no, public_id
     ), f AS (
       INSERT INTO print_files (order_id, position, file_name, storage_key, content_type, size_bytes, color, sides, copies, page_range)
       SELECT o.id, x.position, x.file_name, x.storage_key, x.content_type, x.size_bytes, x.color, x.sides, x.copies, x.page_range
       FROM o, jsonb_to_recordset($5::jsonb) AS x(position int, file_name text, storage_key text, content_type text,
                                                  size_bytes bigint, color text, sides text, copies int, page_range text)
     ), u AS (
       UPDATE print_uploads SET order_id = (SELECT id FROM o) WHERE storage_key = ANY($6::text[])
     )
     SELECT order_no, public_id FROM o`,
    [publicId, input.customerName, input.phone, input.ipHash, JSON.stringify(files), files.map((f) => f.storage_key)],
  );
  return row;
}

// ---------- Reading orders ----------

const ORDER_COLUMNS = `
  id::int AS id, order_no, public_id, customer_name, phone, status,
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
  (extract(epoch FROM created_at) * 1000)::float8 AS created_ms,
  CASE WHEN updated_by IS NOT NULL THEN to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') END AS updated_ist,
  updated_by`;

const FILE_COLUMNS = `
  id::int AS id, order_id::int AS order_id, position, file_name, content_type, size_bytes::int AS size_bytes,
  color, sides, copies, page_range, printed_count,
  to_char(printed_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') AS printed_ist, printed_by,
  deleted_at IS NOT NULL AS deleted`;

async function withFiles(orders: Omit<PrintOrder, "files">[]): Promise<PrintOrder[]> {
  if (orders.length === 0) return [];
  const files = await query<PrintFile>(
    `SELECT ${FILE_COLUMNS} FROM print_files WHERE order_id = ANY($1::bigint[]) ORDER BY order_id, position`,
    [orders.map((o) => o.id)],
  );
  return orders.map((o) => ({ ...o, files: files.filter((f) => f.order_id === o.id) }));
}

export async function listOrders(status: PrintStatus | "all", limit = 100): Promise<PrintOrder[]> {
  const orders = await query<Omit<PrintOrder, "files">>(
    `SELECT ${ORDER_COLUMNS} FROM print_orders
     WHERE $1 = 'all' OR status = $1
     ORDER BY created_at DESC LIMIT $2`,
    [status, limit],
  );
  return withFiles(orders);
}

/** The customer's confirmation page */
export async function getOrderByPublicId(publicId: string): Promise<PrintOrder | null> {
  if (!/^[0-9a-f]{32}$/.test(publicId)) return null;
  const [order] = await query<Omit<PrintOrder, "files">>(`SELECT ${ORDER_COLUMNS} FROM print_orders WHERE public_id = $1`, [publicId]);
  return order ? (await withFiles([order]))[0] : null;
}

/** Where a file is stored, for the dashboard's file viewer */
export async function getFileLocation(
  fileId: number,
): Promise<{ file_name: string; storage_key: string; content_type: string; order_no: string; deleted: boolean } | null> {
  if (!Number.isSafeInteger(fileId) || fileId < 1) return null;
  const [row] = await query<{ file_name: string; storage_key: string; content_type: string; order_no: string; deleted: boolean }>(
    `SELECT f.file_name, f.storage_key, f.content_type, o.order_no, f.deleted_at IS NOT NULL AS deleted
     FROM print_files f JOIN print_orders o ON o.id = f.order_id WHERE f.id = $1`,
    [fileId],
  );
  return row ?? null;
}

/** Cached per request: the sidebar badge and the orders page both ask */
export const printStats = cache(async () => {
  const rows = await query<{ status: PrintStatus; n: number }>(
    `SELECT status, count(*)::int AS n FROM print_orders GROUP BY status`,
  );
  const byStatus: Record<PrintStatus | "all", number> = { new: 0, printed: 0, collected: 0, all: 0 };
  for (const r of rows) {
    byStatus[r.status] = r.n;
    byStatus.all += r.n;
  }
  return byStatus;
});

// ---------- Dashboard actions ----------

/** Counts one print of a file. The order becomes "printed" once every file has been printed. */
export async function recordPrint(
  fileId: number,
  by: string,
): Promise<{ order_no: string; file: PrintFile; orderPrinted: boolean } | null> {
  const [hit] = await query<{ order_id: number }>(
    `UPDATE print_files SET printed_count = printed_count + 1, printed_at = now(), printed_by = $2
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING order_id::int AS order_id`,
    [fileId, by],
  );
  if (!hit) return null;

  const updated = await query(
    `UPDATE print_orders o SET status = 'printed', updated_at = now(), updated_by = $2
     WHERE o.id = $1 AND o.status = 'new'
       AND NOT EXISTS (SELECT 1 FROM print_files f WHERE f.order_id = o.id AND f.printed_count = 0)
     RETURNING id`,
    [hit.order_id, by],
  );
  const [file] = await query<PrintFile & { order_no: string }>(
    `SELECT ${FILE_COLUMNS}, (SELECT order_no FROM print_orders o WHERE o.id = print_files.order_id) AS order_no
     FROM print_files WHERE id = $1`,
    [fileId],
  );
  return { order_no: file.order_no, file, orderPrinted: updated.length > 0 };
}

/** Marks an order collected, or (undo) moves a collected order back */
export async function setOrderStatus(
  id: number,
  to: "collected" | "reopen",
  by: string,
): Promise<{ order_no: string; status: PrintStatus } | null> {
  const [row] = await query<{ order_no: string; status: PrintStatus }>(
    to === "collected"
      ? `UPDATE print_orders SET status = 'collected', updated_at = now(), updated_by = $2
         WHERE id = $1 AND status <> 'collected' RETURNING order_no, status`
      : `UPDATE print_orders o SET updated_at = now(), updated_by = $2,
           status = CASE WHEN EXISTS (SELECT 1 FROM print_files f WHERE f.order_id = o.id AND f.printed_count > 0)
                         THEN 'printed' ELSE 'new' END
         WHERE id = $1 AND status = 'collected' RETURNING order_no, status`,
    [id, by],
  );
  return row ?? null;
}

// ---------- Deleting old files ----------

export async function expiredUploads(keepDays: number, limit = 500): Promise<string[]> {
  const rows = await query<{ storage_key: string }>(
    `SELECT storage_key FROM print_uploads
     WHERE deleted_at IS NULL AND created_at < now() - make_interval(days => $1)
     ORDER BY created_at LIMIT $2`,
    [keepDays, limit],
  );
  return rows.map((r) => r.storage_key);
}

/** Returns how many of the keys belonged to submitted orders (the rest were abandoned uploads) */
export async function markDeleted(keys: string[]): Promise<number> {
  await query(`UPDATE print_uploads SET deleted_at = now() WHERE storage_key = ANY($1::text[])`, [keys]);
  const rows = await query(
    `UPDATE print_files SET deleted_at = now() WHERE storage_key = ANY($1::text[]) AND deleted_at IS NULL RETURNING id`,
    [keys],
  );
  return rows.length;
}

const CLEANUP_KEY = "print.last_cleanup";

/** True at most once per interval, so page visits can trigger the clean-up without repeating it */
export async function claimCleanup(minutes: number): Promise<boolean> {
  const rows = await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, now()::text)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE app_settings.updated_at < now() - make_interval(mins => $2)
     RETURNING key`,
    [CLEANUP_KEY, minutes],
  );
  return rows.length > 0;
}
