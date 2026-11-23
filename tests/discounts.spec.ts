import "./unitDb"; // first: the no-browser tests' own throwaway database
import { expect, test } from "@playwright/test";
import { confirmDraftAs } from "@/lib/assistant/confirm";
import { draftDiscount } from "@/lib/assistant/tools/discounts";
import { draftBooking } from "@/lib/assistant/tools/drafts";
import { draftPayment } from "@/lib/assistant/tools/payments";
import type { SessionUser } from "@/lib/auth";
import { addDays, todayIST } from "@/lib/dates";
import { databaseKind, query } from "@/lib/db";
import { overpaidBy, parseDiscount, saveDiscount, settledDiscount } from "@/lib/expenses/discountInput";
import { outstanding } from "@/lib/expenses/overview";
import { fromObject } from "@/lib/expenses/tripInput";
import { balanceOf, getTrip, listTrips, payableOf, payState } from "@/lib/expenses/trips";

/**
 * Discounts: the rules (lib/expenses/discountInput.ts), the numbers every page and Annapurna Assist read
 * (payableOf / balanceOf), the database's own rule, and the assistant's draft_discount and draft_booking with a
 * discount (they save nothing; Confirm saves once). No browser, no AI: the code itself, on the no-browser tests'
 * throwaway database (tests/unitDb.ts), which other test files share, so rows are counted, never assumed.
 */

test.describe.configure({ mode: "serial" });

const inDays = (n: number) => addDays(todayIST(), n);
const one = async (sql: string, params: unknown[] = []) => (await query<{ n: number }>(sql, params))[0].n;

let admin: SessionUser;
let vehicleId: number;
let driverId: number;

type Tool = { name: string; invoke: (input: object, config: object) => Promise<unknown> };
const [DISCOUNT, BOOKING, PAYMENT] = [draftDiscount, draftBooking, draftPayment] as unknown as Tool[];
type Result = { status: string; note?: string; data: { ready: boolean; draft_id?: string; warning?: string | null } & Record<string, unknown> };

async function draft(tool: Tool, args: Record<string, unknown>): Promise<Result> {
  const message = await tool.invoke({ type: "tool_call", id: "t", name: tool.name, args }, { configurable: { userId: admin.id } });
  return (message as unknown as { artifact: Result }).artifact;
}

/** A booking of the test vehicle, starting in `start` days: its number */
async function booking(start: number, total: number | null, received = 0, customer = "Discount Customer"): Promise<string> {
  const [t] = await query<{ id: number; trip_no: string }>(
    `INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date, pickup_state, pickup_city,
                        drop_state, drop_city, total_amount, created_by)
     VALUES ($1, $2, $3, '9876500301', $4, $4, 'Andhra Pradesh', 'Vijayawada', 'Andhra Pradesh', 'Guntur', $5, 'tests')
     RETURNING id::int AS id, trip_no`,
    [vehicleId, driverId, customer, inDays(start), total],
  );
  if (received) {
    await query(`INSERT INTO trip_payments (trip_id, party, amount, method, paid_at) VALUES ($1, 'customer', $2, 'cash', now())`, [t.id, received]);
  }
  return t.trip_no;
}

test.beforeAll(async () => {
  expect(databaseKind()).toBe("pglite"); // never anything else
  await query("INSERT INTO users (mobile, name, role, password_hash, created_by) VALUES ('9000000301', 'Discount Admin', 'admin', 'x', 'tests')");
  [admin] = await query<SessionUser>("SELECT id::int AS id, mobile, name, role FROM users WHERE mobile = '9000000301'");
  [{ id: vehicleId }] = await query<{ id: number }>("INSERT INTO vehicles (name) VALUES ('Discount Test Innova') RETURNING id::int AS id");
  [{ id: driverId }] = await query<{ id: number }>("INSERT INTO drivers (name, phone) VALUES ('Discount Test Driver', '9000000309') RETURNING id::int AS id");
});

test("the numbers: what the customer pays, owes, and the paid badge, with a discount", () => {
  const t = { total_amount: 12000, discount: 500, received: 11000 };
  expect(payableOf(t)).toBe(11500);
  expect(balanceOf(t)).toBe(500);
  expect(payState(t)).toBe("partial");
  expect(payState({ ...t, received: 11500 })).toBe("paid");
  // No total: nothing is known yet, whatever the discount
  expect(payableOf({ total_amount: null, discount: null })).toBeNull();
  // No discount: as before
  expect(balanceOf({ total_amount: 12000, discount: null, received: 2000 })).toBe(10000);
});

test("the form's rules: rupees, a percentage of the total, and what's refused", () => {
  const read = (fields: Record<string, string>, total: number | null) => parseDiscount(fromObject(fields), total);
  expect(read({ discount_amount: "500", discount_reason: " Regular   customer " }, 12000)).toEqual({ ok: true, discount: { amount: 500, reason: "Regular customer" } });
  // 5% of ₹12,345 = ₹617 (whole rupees)
  expect(read({ discount_amount: "5", discount_mode: "pct" }, 12345)).toEqual({ ok: true, discount: { amount: 617, reason: null } });
  // Empty or 0: no discount
  expect(read({ discount_amount: "" }, 12000)).toEqual({ ok: true, discount: { amount: null, reason: null } });
  expect(read({ discount_amount: "0" }, 12000)).toEqual({ ok: true, discount: { amount: null, reason: null } });
  // Refused, each with the field to fix
  expect(read({ discount_amount: "13000" }, 12000)).toMatchObject({ ok: false, field: "discount_amount" });
  expect(read({ discount_amount: "120", discount_mode: "pct" }, 12000)).toMatchObject({ ok: false, field: "discount_amount" });
  expect(read({ discount_amount: "500" }, null)).toMatchObject({ ok: false, field: "total_amount" });
  expect(read({ discount_amount: "abc" }, 12000)).toMatchObject({ ok: false, field: "discount_amount" });
  // A discount that would leave the customer owing less than they've paid
  expect(overpaidBy(12000, { amount: 2000, reason: null }, 11000)).toContain("at most ₹1,000");
  expect(overpaidBy(12000, { amount: 1000, reason: null }, 11000)).toBeNull();
  // Settling: the balance becomes discount, added to any already given
  expect(settledDiscount({ total_amount: 12000, discount: 500, discount_reason: "Regular customer", received: 11300 })).toEqual({
    amount: 700,
    reason: "Regular customer",
  });
  expect(settledDiscount({ total_amount: 12000, discount: null, discount_reason: null, received: 12000 })).toBeNull();
});

test("the database refuses a discount over the total, or without one", async () => {
  const no = await booking(60, 5000);
  await expect(query("UPDATE trips SET discount = 6000 WHERE trip_no = $1", [no])).rejects.toThrow();
  await expect(query("UPDATE trips SET total_amount = NULL, discount = 100 WHERE trip_no = $1", [no])).rejects.toThrow();
  await query("UPDATE trips SET discount = 5000 WHERE trip_no = $1", [no]); // all of it is allowed
  expect((await getTrip(no))!.discount).toBe(5000);
});

test("a booking fully paid after its discount isn't owing: Payment due tab, Overview totals, balances", async () => {
  const before = await outstanding();
  const no = await booking(62, 10000, 9700);
  // Owes ₹300 now
  expect((await outstanding()).customerDue).toBe(before.customerDue + 300);
  expect((await listTrips("due", { search: "", customer: "Discount Customer", pageSize: 50 })).trips.map((t) => t.trip_no)).toContain(no);
  // Settled: the ₹300 becomes discount, and it owes nothing
  const trip = (await getTrip(no))!;
  const saved = await saveDiscount(trip, settledDiscount(trip)!, admin, { note: "settled the balance of ₹300" });
  expect(saved).toMatchObject({ ok: true, changed: true });
  const after = (await getTrip(no))!;
  expect([after.discount, balanceOf(after), payState(after)]).toEqual([300, 0, "paid"]);
  expect((await outstanding()).customerDue).toBe(before.customerDue);
  expect((await listTrips("due", { customer: "Discount Customer", pageSize: 50 })).trips.map((t) => t.trip_no)).not.toContain(no);
  // Logged once, with the reason it was given
  expect(await one("SELECT count(*)::int AS n FROM activity_log WHERE action = 'trip.discount_changed' AND target = $1 AND details LIKE '%settled the balance%'", [no])).toBe(1);
});

test("draft_discount saves nothing; Confirm saves the rupees on the card once, logged via Annapurna Assist", async () => {
  const no = await booking(64, 12000, 2000);
  const writes = async () => one("SELECT ((SELECT count(*) FROM trips WHERE discount IS NOT NULL) + (SELECT count(*) FROM activity_log))::int AS n");
  const before = await writes();

  // 5% of ₹12,000: worked out by our code, not the model
  const pct = await draft(DISCOUNT, { booking: no, percent: 5, reason: "Festival offer" });
  expect(pct.data.ready, JSON.stringify(pct)).toBe(true);
  expect(pct.data.discount).toMatchObject({ after: "₹600 (Festival offer)", to_pay: "₹11,400", balance_after: "₹9,400 still to pay" });
  // Refused or unclear: nothing kept
  for (const args of [
    { booking: no }, // how much?
    { amount: 200 }, // which booking?
    { booking: no, amount: 20000 }, // more than the total
    { booking: no, amount: 200, settle: true }, // two at once
    { booking: no, remove: true }, // nothing to remove yet
  ]) {
    expect((await draft(DISCOUNT, args)).data.ready, JSON.stringify(args)).toBe(false);
  }
  expect(await writes()).toBe(before); // a draft never writes

  // Confirm: saved once, even pressed three times at once
  const results = await Promise.all([1, 2, 3].map(() => confirmDraftAs(admin, pct.data.draft_id)));
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => r.ok)).toMatchObject({ message: `Discount saved on ${no}.` });
  const saved = (await getTrip(no))!;
  expect([saved.discount, saved.discount_reason]).toEqual([600, "Festival offer"]);
  expect(await one("SELECT count(*)::int AS n FROM activity_log WHERE target = $1 AND details LIKE '%via Annapurna Assist'", [no])).toBe(1);

  // A new amount replaces the old one, and the card says so
  const replace = await draft(DISCOUNT, { booking: no, amount: 1000 });
  expect(replace.data.warning).toContain("replaces the ₹600 discount");
  // Payment drafts work out what's left after the discount
  const pay = await draft(PAYMENT, { booking: no, amount: 1000, method: "upi" });
  expect((pay.data.payment as Record<string, string>).after).toBe("₹8,400 still to pay after this");
});

test("settle and remove drafts; a settle draft is refused if a payment came in since", async () => {
  const no = await booking(66, 8000, 7800);
  const settle = await draft(DISCOUNT, { booking: no, settle: true });
  expect(settle.data.discount).toMatchObject({ action: "settle", after: "₹200 (Balance let go when settling)", balance_after: "Fully paid" });
  // The customer pays ₹100 more before Confirm: the draft's balance is out of date
  const [{ id }] = await query<{ id: number }>("SELECT id::int AS id FROM trips WHERE trip_no = $1", [no]);
  await query(`INSERT INTO trip_payments (trip_id, party, amount, method, paid_at) VALUES ($1, 'customer', 100, 'cash', now())`, [id]);
  const refused = await confirmDraftAs(admin, settle.data.draft_id);
  expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("balance has changed") });
  expect((await getTrip(no))!.discount).toBeNull();
  // Asked again: settles the ₹100 left now
  const again = await draft(DISCOUNT, { booking: no, settle: true });
  expect((await confirmDraftAs(admin, again.data.draft_id)).ok).toBe(true);
  expect(balanceOf((await getTrip(no))!)).toBe(0);
  // Remove: back to owing ₹100
  const remove = await draft(DISCOUNT, { booking: no, remove: true });
  expect(await confirmDraftAs(admin, remove.data.draft_id)).toMatchObject({ ok: true, message: `Discount removed from ${no}.` });
  expect(balanceOf((await getTrip(no))!)).toBe(100);
});

test("draft_booking takes a discount (rupees or %), shows what the customer pays, and Confirm saves it", async () => {
  const args = {
    customer_name: "Discount Booking Customer",
    customer_phone: "9876500302",
    vehicle: "Discount Test Innova",
    driver: "Discount Test Driver",
    start_date: inDays(80),
    days: 1,
    pickup_city: "Vijayawada",
    drop_city: "Guntur",
    total_amount: 9000,
    discount_percent: 10,
    discount_reason: "Regular customer",
  };
  const ready = await draft(BOOKING, args);
  expect(ready.data.ready, JSON.stringify(ready)).toBe(true);
  expect(ready.data.booking).toMatchObject({ total: "₹9,000", discount: "₹900 (Regular customer)", to_pay: "₹8,100" });
  const saved = await confirmDraftAs(admin, ready.data.draft_id);
  expect(saved.ok, JSON.stringify(saved)).toBe(true);
  const no = (saved as { message: string }).message.match(/VB-\d+/)![0];
  const trip = (await getTrip(no))!;
  expect([trip.total_amount, trip.discount, trip.discount_reason, payableOf(trip)]).toEqual([9000, 900, "Regular customer", 8100]);
  // An advance over what's left after the discount is refused, with the form's words
  const tooMuch = await draft(BOOKING, { ...args, start_date: inDays(82), advance_amount: 8500, advance_method: "cash" });
  expect(tooMuch.data.ready).toBe(false);
  expect(tooMuch.note).toContain("after the discount");
});
