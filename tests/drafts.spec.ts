import { rmSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cancelDraftAs, confirmDraftAs } from "@/lib/assistant/confirm";
import { draftBooking } from "@/lib/assistant/tools/drafts";
import { draftFuel } from "@/lib/assistant/tools/fuel";
import { draftPayment } from "@/lib/assistant/tools/payments";
import type { SessionUser } from "@/lib/auth";
import { addDays, todayIST } from "@/lib/dates";
import { databaseKind, query } from "@/lib/db";

/**
 * Task 4.12: the promises Annapurna Assist's drafts make, tested on the code itself (no browser, no AI):
 * - a draft never writes: the draft tools change no bookings, payments, fuel or activity log, ready or not
 * - Confirm writes exactly once, even pressed several times at the same moment (a double-click, two tabs)
 * - only the admin who asked can confirm or cancel; cancelled and expired drafts can't be confirmed
 * - a save that fails puts the draft back, and nothing is half-saved
 *
 * Its own throwaway database (PGlite in .data/pglite-drafts, made fresh every run), not the browser tests' one
 * and never the Docker database or Neon. The confirm code is lib/assistant/confirm.ts, which the Confirm and Cancel
 * server actions call after checking who is signed in.
 */

const DB = "./.data/pglite-drafts";
rmSync(DB, { recursive: true, force: true });
process.env.DATABASE_URL = `pglite:${DB}`; // before the first query: lib/db.ts connects on first use

test.describe.configure({ mode: "serial" });

const inDays = (n: number) => addDays(todayIST(), n);
const one = async (sql: string, params: unknown[] = []) => (await query<{ n: number }>(sql, params))[0].n;

/** Everything a draft must never touch, counted */
const WATCHED = ["trips", "trip_payments", "vehicle_expenses", "activity_log"] as const;
async function counts(): Promise<Record<(typeof WATCHED)[number] | "assistant_drafts", number>> {
  const entries = await Promise.all(
    [...WATCHED, "assistant_drafts"].map(async (t) => [t, await one(`SELECT count(*)::int AS n FROM ${t}`)] as const),
  );
  return Object.fromEntries(entries) as Record<(typeof WATCHED)[number] | "assistant_drafts", number>;
}

let admin: SessionUser;
let other: SessionUser;
/** Any of the three draft tools (their inputs differ, so they're called through this plain shape) */
type Tool = { name: string; invoke: (input: object, config: object) => Promise<unknown> };
const [BOOKING, PAYMENT, FUEL] = [draftBooking, draftPayment, draftFuel] as unknown as Tool[];

/** Runs a draft tool as an admin, like the graph does; gives its result (the card's data) */
async function draft(tool: Tool, args: Record<string, unknown>, user = admin) {
  const message = await tool.invoke({ type: "tool_call", id: "t", name: tool.name, args }, { configurable: { userId: user.id } });
  return (message as unknown as { artifact: { status: string; data: { ready: boolean; draft_id?: string } } }).artifact;
}
async function readyDraft(tool: Tool, args: Record<string, unknown>): Promise<string> {
  const r = await draft(tool, args);
  expect(r.data.ready, JSON.stringify(r)).toBe(true);
  return r.data.draft_id!;
}

const booking = (start: number, extra: Record<string, unknown> = {}) => ({
  customer_name: "Draft Test Customer",
  customer_phone: "9876500001",
  vehicle: "Carens",
  driver: "Test Driver",
  start_date: inDays(start),
  days: 2,
  pickup_city: "Vijayawada",
  drop_city: "Guntur",
  total_amount: 8000,
  ...extra,
});

test.beforeAll(async () => {
  expect(databaseKind()).toBe("pglite"); // never anything else
  for (const [mobile, name] of [["9000000201", "Drafts Admin"], ["9000000202", "Other Admin"]]) {
    await query("INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ($1, $2, 'admin', 'not-a-real-hash', 'tests')", [mobile, name]);
  }
  const users = await query<SessionUser>("SELECT id::int AS id, mobile, name, role FROM users ORDER BY mobile");
  [admin, other] = users;
  const [v] = await query<{ id: number }>("INSERT INTO vehicles (name) VALUES ('Test Carens') RETURNING id::int AS id");
  const [d] = await query<{ id: number }>("INSERT INTO drivers (name, phone) VALUES ('Test Driver', '9000000209') RETURNING id::int AS id");
  // A booking for the payment and fuel drafts: VB-0001, ₹10,000, nothing paid
  await query(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date, pickup_state, pickup_city,
                        drop_state, drop_city, total_amount, driver_amount, created_by)
     VALUES ($1, $2, 'Payment Test Customer', '9876500002', $3, $3, 'Andhra Pradesh', 'Vijayawada', 'Andhra Pradesh', 'Guntur', 10000, 1500, 'tests')`,
    [v.id, d.id, inDays(5)],
  );
});

test("a draft never writes: the draft tools change no bookings, payments, fuel or activity, ready or refused", async () => {
  const before = await counts();
  // Ready ones (each keeps one row in assistant_drafts, nothing else)
  await readyDraft(BOOKING, booking(20));
  await readyDraft(PAYMENT, { booking: "VB-0001", amount: 2000, method: "upi" });
  await readyDraft(FUEL, { booking: "VB-0001", amount: 3000, litres: 30 });
  await readyDraft(FUEL, { vehicle: "Carens", amount: 1500 });
  // Refused or unclear ones (no row at all)
  for (const [tool, args] of [
    [BOOKING, { ...booking(20), customer_phone: undefined }], // phone missing
    [BOOKING, booking(5)], // vehicle busy (VB-0001)
    [BOOKING, { ...booking(20), vehicle: "Scorpio" }], // no such vehicle
    [PAYMENT, { booking: "VB-0001", amount: 2000 }], // no method
    [PAYMENT, { booking: "VB-0001", amount: 2000, method: "cash", paid_on: inDays(1) }], // in the future
    [FUEL, { amount: 1000 }], // for what?
  ] as [Tool, Record<string, unknown>][]) {
    expect((await draft(tool, args)).data.ready).toBe(false);
  }
  const after = await counts();
  for (const t of WATCHED) expect(after[t], t).toBe(before[t]);
  expect(after.assistant_drafts).toBe(before.assistant_drafts + 4);
});

test("Confirm writes exactly once, even pressed five times at the same moment", async () => {
  for (const [kind, tool, args, table] of [
    ["booking", BOOKING, booking(30), "trips"],
    ["payment", PAYMENT, { booking: "VB-0001", amount: 2500, method: "cash" }, "trip_payments"],
    ["fuel", FUEL, { booking: "VB-0001", amount: 3150, litres: 30 }, "vehicle_expenses"],
  ] as const) {
    const id = await readyDraft(tool, args);
    const before = await counts();
    const results = await Promise.all(Array.from({ length: 5 }, () => confirmDraftAs(admin, id)));
    const after = await counts();
    expect(results.filter((r) => r.ok), `${kind}: ${JSON.stringify(results)}`).toHaveLength(1);
    expect(after[table], `${kind}: one ${table} row`).toBe(before[table] + 1);
    expect(after.activity_log, `${kind}: one log entry`).toBe(before.activity_log + 1);
    // Nothing else changed
    for (const t of WATCHED) if (t !== table && t !== "activity_log") expect(after[t], `${kind}: ${t}`).toBe(before[t]);
    // And pressed again later: still only the one
    const again = await confirmDraftAs(admin, id);
    expect(again.ok).toBe(false);
    expect((await counts())[table]).toBe(after[table]);
  }
  // The log says where they came from
  expect(await one("SELECT count(*)::int AS n FROM activity_log WHERE details LIKE '%via Annapurna Assist'")).toBe(3);
});

test("only the admin who asked can confirm or cancel; cancelled and expired drafts can't be confirmed", async () => {
  const before = await counts();
  const id = await readyDraft(BOOKING, booking(40));
  // Another admin: as if it didn't exist
  expect(await confirmDraftAs(other, id)).toMatchObject({ ok: false, error: "This draft wasn't found." });
  expect(await cancelDraftAs(other, id)).toMatchObject({ ok: false, error: "This draft wasn't found." });
  // Cancelled: can't be confirmed, from any tab
  expect((await cancelDraftAs(admin, id)).ok).toBe(true);
  expect(await confirmDraftAs(admin, id)).toMatchObject({ ok: false, card: { status: "cancelled" } });
  // Expired: can't be confirmed either
  const old = await readyDraft(BOOKING, booking(44));
  await query("UPDATE assistant_drafts SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1", [old]);
  expect(await confirmDraftAs(admin, old)).toMatchObject({ ok: false, card: { status: "expired" } });
  // Made-up ids
  for (const id of ["00000000-0000-4000-8000-000000000000", "1 OR 1=1", 42, null]) {
    expect((await confirmDraftAs(admin, id)).ok).toBe(false);
  }
  const after = await counts();
  for (const t of WATCHED) expect(after[t], t).toBe(before[t]);
});

test("a save that fails puts the draft back, half-saves nothing, and works once the problem is gone", async () => {
  const id = await readyDraft(BOOKING, booking(50));
  // Someone books the same vehicle on those days after the draft was made
  const [clash] = await query<{ id: number }>(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date, pickup_state, pickup_city,
                        drop_state, drop_city, created_by)
     SELECT vehicle_id, driver_id, 'Got There First', '9876500003', $1, $1, pickup_state, pickup_city, drop_state, drop_city, 'tests'
     FROM trips WHERE trip_no = 'VB-0001' RETURNING id::int AS id`,
    [inDays(51)],
  );
  const before = await counts();
  const refused = await confirmDraftAs(admin, id);
  expect(refused.ok).toBe(false);
  expect(refused).toMatchObject({ error: expect.stringContaining("is already booked on these days") });
  expect(refused).toMatchObject({ error: expect.stringContaining("Nothing was saved.") });
  for (const t of WATCHED) expect((await counts())[t], t).toBe(before[t]);
  expect(await one("SELECT count(*)::int AS n FROM assistant_drafts WHERE id = $1 AND status = 'pending'", [id])).toBe(1);

  // The other booking is cancelled: now Confirm works, once
  await query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [clash.id]);
  expect((await confirmDraftAs(admin, id)).ok).toBe(true);
  expect((await counts()).trips).toBe(before.trips + 1);
  expect((await confirmDraftAs(admin, id)).ok).toBe(false);
  expect((await counts()).trips).toBe(before.trips + 1);
});
