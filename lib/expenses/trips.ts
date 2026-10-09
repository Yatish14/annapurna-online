import { dbErrorCode, EXCLUSION_VIOLATION, query } from "../db";
import { fmtRange, MONTHS_LONG } from "../dates";
import { formatNumber, formatRupees, PAYMENT_METHODS, type PaymentMethod } from "./money";
import { placeText } from "./places";

// ---------- Types ----------

/** Where a booking is, from its dates (or cancelled) */
export type TripPhase = "upcoming" | "ongoing" | "completed" | "cancelled";

/** How much of the total the customer has paid ("unset": the total isn't entered yet) */
export type PayState = "paid" | "partial" | "due" | "unset";

export type Trip = {
  id: number;
  trip_no: string;
  vehicle_id: number;
  vehicle_name: string;
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  pickup_state: string;
  pickup_city: string;
  drop_state: string;
  drop_city: string;
  round_trip: boolean;
  dest_state: string | null;
  dest_city: string | null;
  referrer_name: string | null;
  referrer_phone: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  /** Km typed in directly (only when there are no odometer readings) */
  km_direct: number | null;
  total_amount: number | null;
  driver_amount: number | null;
  notes: string | null;
  status: "booked" | "cancelled";
  phase: TripPhase;
  /** Test data from npm run db:seed-expenses */
  is_sample: boolean;
  /** Paid by the customer so far */
  received: number;
  /** Paid to the driver so far */
  driver_paid: number;
  /** Fuel filled for this booking (repairs, FASTag, EMI and insurance belong to the vehicle, not a booking) */
  fuel: number;
  /** The booking's other expenses: tolls, parking… */
  other: number;
  created_ist: string;
  created_by: string | null;
  updated_ist: string | null;
  updated_by: string | null;
};

export type TripInput = {
  vehicleId: number;
  driverId: number;
  customerName: string;
  customerPhone: string;
  startDate: string;
  endDate: string;
  pickupState: string;
  pickupCity: string;
  dropState: string;
  dropCity: string;
  roundTrip: boolean;
  destState: string | null;
  destCity: string | null;
  referrerName: string | null;
  referrerPhone: string | null;
  notes: string | null;
};

/** Numbers that change after the booking: odometer readings and the money agreed */
export type TripReadings = {
  odometerStart: number | null;
  odometerEnd: number | null;
  kmDirect: number | null;
  totalAmount: number | null;
  driverAmount: number | null;
};

// ---------- Derived figures ----------

/** Km travelled: from the odometer readings, or as typed in directly */
export function kmOf(t: Pick<Trip, "odometer_start" | "odometer_end"> & { km_direct?: number | null }): number | null {
  return t.odometer_start !== null && t.odometer_end !== null ? t.odometer_end - t.odometer_start : (t.km_direct ?? null);
}

export function payState(t: Pick<Trip, "total_amount" | "received">): PayState {
  if (t.total_amount === null) return "unset";
  if (t.received >= t.total_amount) return "paid";
  return t.received > 0 ? "partial" : "due";
}

export const PAY_LABELS: Record<PayState, string> = {
  paid: "Paid",
  partial: "Partly paid",
  due: "Payment due",
  unset: "Total not set",
};

export const PHASE_LABELS: Record<TripPhase, string> = {
  upcoming: "Upcoming",
  ongoing: "On trip",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Still to collect from the customer (never negative) */
export function balanceOf(t: Pick<Trip, "total_amount" | "received">): number {
  return Math.max((t.total_amount ?? 0) - t.received, 0);
}

/** Still to pay the driver (never negative) */
export function driverOwed(t: Pick<Trip, "driver_amount" | "driver_paid">): number {
  return Math.max((t.driver_amount ?? 0) - t.driver_paid, 0);
}

/**
 * What the booking has earned so far, on money actually received:
 * received from the customer − driver amount − fuel − other expenses (tolls, parking…).
 * The driver amount is the agreed one (not only what's paid yet), so an unpaid driver doesn't inflate it.
 * Repairs, FASTag, EMI and insurance are the vehicle's costs: they count in the vehicle's profit, not a booking's.
 */
export function profitOf(t: Pick<Trip, "received" | "driver_amount" | "fuel" | "other">): number {
  return t.received - (t.driver_amount ?? 0) - t.fuel - t.other;
}

/** The profit once the customer pays the full total (null until the total is entered) */
export function profitWhenPaid(t: Pick<Trip, "total_amount" | "driver_amount" | "fuel" | "other">): number | null {
  if (t.total_amount === null) return null;
  return t.total_amount - (t.driver_amount ?? 0) - t.fuel - t.other;
}

/** "Vijayawada → Hyderabad", or for a round trip "Vijayawada → Araku → Vijayawada" */
export function routeText(t: Pick<Trip, "pickup_city" | "drop_city" | "round_trip" | "dest_city">): string {
  return t.round_trip ? `${t.pickup_city} → ${t.dest_city} → ${t.pickup_city}` : `${t.pickup_city} → ${t.drop_city}`;
}

// ---------- Reading ----------

const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

const TRIP_COLUMNS = `
  SELECT t.id::int AS id, t.trip_no, t.vehicle_id::int AS vehicle_id, v.name AS vehicle_name,
         t.driver_id::int AS driver_id, d.name AS driver_name, d.phone AS driver_phone,
         t.customer_name, t.customer_phone, t.start_date::text AS start_date, t.end_date::text AS end_date,
         t.pickup_state, t.pickup_city, t.drop_state, t.drop_city, t.round_trip, t.dest_state, t.dest_city,
         t.referrer_name, t.referrer_phone, t.odometer_start, t.odometer_end, t.km_direct,
         t.total_amount::float8 AS total_amount, t.driver_amount::float8 AS driver_amount, t.notes, t.status, t.is_sample,
         CASE WHEN t.status = 'cancelled' THEN 'cancelled'
              WHEN t.start_date > ${TODAY} THEN 'upcoming'
              WHEN t.end_date < ${TODAY} THEN 'completed'
              ELSE 'ongoing' END AS phase,
         pay.received, pay.driver_paid, cost.fuel, cost.other, t.created_by, t.updated_by,
         to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
         to_char(t.updated_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS updated_ist`;

/** Bookings with their vehicle, driver, payment totals (pay.*) and fuel and other expense totals (cost.*) */
const TRIP_FROM = `
  FROM trips t
  JOIN vehicles v ON v.id = t.vehicle_id
  JOIN drivers d ON d.id = t.driver_id
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(p.amount) FILTER (WHERE p.party = 'customer'), 0)::float8 AS received,
           coalesce(sum(p.amount) FILTER (WHERE p.party = 'driver'), 0)::float8 AS driver_paid
    FROM trip_payments p WHERE p.trip_id = t.id AND p.deleted_at IS NULL
  ) pay
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(e.amount) FILTER (WHERE e.kind = 'fuel'), 0)::float8 AS fuel,
           coalesce(sum(e.amount) FILTER (WHERE e.kind = 'other'), 0)::float8 AS other
    FROM vehicle_expenses e WHERE e.trip_id = t.id AND e.deleted_at IS NULL
  ) cost`;

const TRIP_SELECT = `${TRIP_COLUMNS} ${TRIP_FROM}`;

export async function getTrip(tripNo: string): Promise<Trip | null> {
  if (!/^VB-\d{1,9}$/.test(tripNo)) return null;
  const [row] = await query<Trip>(`${TRIP_SELECT} WHERE t.trip_no = $1`, [tripNo]);
  return row ?? null;
}

export async function getTripById(id: number): Promise<Trip | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await query<Trip>(`${TRIP_SELECT} WHERE t.id = $1`, [id]);
  return row ?? null;
}

export const TRIP_VIEWS = ["upcoming", "ongoing", "completed", "due", "cancelled", "all"] as const;
export type TripView = (typeof TRIP_VIEWS)[number];

const VIEW_WHERE: Record<TripView, string> = {
  upcoming: `t.status = 'booked' AND t.start_date > ${TODAY}`,
  ongoing: `t.status = 'booked' AND ${TODAY} BETWEEN t.start_date AND t.end_date`,
  completed: `t.status = 'booked' AND t.end_date < ${TODAY}`,
  due: `t.status = 'booked' AND t.total_amount IS NOT NULL AND pay.received < t.total_amount`,
  cancelled: `t.status = 'cancelled'`,
  all: `true`,
};

const VIEW_ORDER: Record<TripView, string> = {
  upcoming: "t.start_date ASC, t.id ASC",
  ongoing: "t.end_date ASC, t.id ASC",
  completed: "t.end_date DESC, t.id DESC",
  due: "t.start_date ASC, t.id ASC",
  cancelled: "t.start_date DESC, t.id DESC",
  all: "t.start_date DESC, t.id DESC",
};

const likeEscape = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/**
 * One page of bookings. A search ("VB-0004", "0004", a customer, driver, vehicle or referrer name, or any part of
 * a mobile number) looks through every booking, whatever the tab.
 */
export async function listTrips(
  view: TripView,
  { search = "", page = 1, pageSize = 10 }: { search?: string; page?: number; pageSize?: number } = {},
): Promise<{ trips: Trip[]; total: number }> {
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const text = search.trim().slice(0, 60);
  let where: string;
  if (text) {
    let digits = text.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    const like = param(`%${likeEscape(text)}%`);
    const matches = [
      `replace(t.trip_no, '-', '') ILIKE ${param(`%${likeEscape(text.replace(/[\s-]/g, ""))}%`)}`,
      `t.customer_name ILIKE ${like}`,
      `d.name ILIKE ${like}`,
      `v.name ILIKE ${like}`,
      `t.referrer_name ILIKE ${like}`,
    ];
    // Any digits typed on their own ("06", "98490 12345", "+91 …") are also looked for in mobile numbers.
    // Not for "VB-0001" (a booking number) or text with letters ("Ravi 2").
    const numberOnly = /^[\d\s+()-]+$/.test(text);
    if (digits.length >= 1 && numberOnly) {
      const phone = param(`%${digits}%`);
      matches.push(`t.customer_phone LIKE ${phone}`, `d.phone LIKE ${phone}`, `t.referrer_phone LIKE ${phone}`);
    }
    where = `(${matches.join(" OR ")})`;
  } else {
    where = VIEW_WHERE[view];
  }
  const order = text ? VIEW_ORDER.all : VIEW_ORDER[view];

  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total ${TRIP_FROM} WHERE ${where}`,
    params,
  );
  const trips = await query<Trip>(
    `${TRIP_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ${param(pageSize)} OFFSET ${param((Math.max(1, page) - 1) * pageSize)}`,
    params,
  );
  return { trips, total };
}

/** Number of bookings on each tab */
export async function tripCounts(): Promise<Record<TripView, number>> {
  const [row] = await query<Record<TripView, number>>(
    `SELECT ${TRIP_VIEWS.map((v) => `count(*) FILTER (WHERE ${VIEW_WHERE[v]})::int AS ${v}`).join(", ")} ${TRIP_FROM}`,
  );
  return row;
}

/** Bookings of a vehicle, newest first */
export async function vehicleTrips(vehicleId: number, limit = 50): Promise<Trip[]> {
  return query<Trip>(`${TRIP_SELECT} WHERE t.vehicle_id = $1 ORDER BY t.start_date DESC, t.id DESC LIMIT $2`, [vehicleId, limit]);
}

// ---------- Clashes ----------

export type Clash = { trip_no: string; start_date: string; end_date: string; customer_name: string };

/** Another booking of the same vehicle (or with the same driver) on any of these days */
export async function findClash(
  column: "vehicle_id" | "driver_id",
  id: number,
  start: string,
  end: string,
  excludeTripId: number | null,
): Promise<Clash | null> {
  const [row] = await query<Clash>(
    `SELECT trip_no, start_date::text AS start_date, end_date::text AS end_date, customer_name
     FROM trips
     WHERE ${column} = $1 AND status = 'booked' AND start_date <= $3 AND end_date >= $2
       AND ($4::bigint IS NULL OR id <> $4)
     ORDER BY start_date LIMIT 1`,
    [id, start, end, excludeTripId],
  );
  return row ?? null;
}

export function clashText(c: Clash): string {
  return `${c.trip_no} (${c.customer_name}, ${fmtRange(c.start_date, c.end_date)})`;
}

// ---------- Writing ----------

export type SaveResult = { ok: true; trip_no: string } | { ok: false; reason: "vehicle-busy"; clash: Clash | null };

/** New booking, with the advance (if any) recorded as the first customer payment */
export async function createTrip(
  input: TripInput,
  readings: Pick<TripReadings, "odometerStart" | "odometerEnd" | "kmDirect" | "totalAmount" | "driverAmount">,
  advance: { amount: number; method: PaymentMethod } | null,
  fuel: { amount: number; litres: number | null; spentOn: string } | null,
  by: string,
): Promise<SaveResult> {
  try {
    const [row] = await query<{ trip_no: string }>(
      `WITH t AS (
         INSERT INTO trips (vehicle_id, driver_id, customer_name, customer_phone, start_date, end_date,
                            pickup_state, pickup_city, drop_state, drop_city, round_trip, dest_state, dest_city,
                            referrer_name, referrer_phone, notes, odometer_start, total_amount, driver_amount, created_by,
                            odometer_end, km_direct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $26, $27)
         RETURNING id, trip_no
       ), adv AS (
         INSERT INTO trip_payments (trip_id, party, amount, method, paid_at, note, created_by)
         SELECT id, 'customer', $21, $22, now(), 'Advance', $20 FROM t WHERE $21::numeric IS NOT NULL
       ), fuel AS (
         INSERT INTO vehicle_expenses (vehicle_id, trip_id, kind, amount, spent_on, litres, created_by)
         SELECT $1, id, 'fuel', $23, $24::date, $25::numeric, $20 FROM t WHERE $23::numeric IS NOT NULL
       )
       SELECT trip_no FROM t`,
      [
        input.vehicleId, input.driverId, input.customerName, input.customerPhone, input.startDate, input.endDate,
        input.pickupState, input.pickupCity, input.dropState, input.dropCity, input.roundTrip, input.destState, input.destCity,
        input.referrerName, input.referrerPhone, input.notes, readings.odometerStart, readings.totalAmount, readings.driverAmount,
        by, advance?.amount ?? null, advance?.method ?? "cash", fuel?.amount ?? null, fuel?.spentOn ?? null, fuel?.litres ?? null,
        readings.odometerEnd, readings.kmDirect,
      ],
    );
    return { ok: true, trip_no: row.trip_no };
  } catch (err) {
    if (dbErrorCode(err) !== EXCLUSION_VIOLATION) throw err;
    return { ok: false, reason: "vehicle-busy", clash: await findClash("vehicle_id", input.vehicleId, input.startDate, input.endDate, null) };
  }
}

const dateText = (t: { start_date: string; end_date: string }) => fmtRange(t.start_date, t.end_date);
const orNone = (s: string | null | undefined) => s || "none";

/** What changed between the saved booking and the edited one, for the activity log */
function describeChanges(before: Trip, after: TripInput, names: { vehicle: string; driver: string }): string[] {
  const changes: string[] = [];
  const add = (label: string, from: string, to: string) => from !== to && changes.push(`${label}: ${from} → ${to}`);
  add("Customer", `${before.customer_name} (${before.customer_phone})`, `${after.customerName} (${after.customerPhone})`);
  add("Vehicle", before.vehicle_name, names.vehicle);
  add("Driver", before.driver_name, names.driver);
  add("Dates", dateText(before), dateText({ start_date: after.startDate, end_date: after.endDate }));
  add("Pickup", placeText(before.pickup_city, before.pickup_state), placeText(after.pickupCity, after.pickupState));
  add("Drop", placeText(before.drop_city, before.drop_state), placeText(after.dropCity, after.dropState));
  add("Round trip", before.round_trip ? "yes" : "no", after.roundTrip ? "yes" : "no");
  add("Went to", orNone(placeText(before.dest_city, before.dest_state)), orNone(placeText(after.destCity, after.destState)));
  add(
    "Referred by",
    orNone(before.referrer_name && `${before.referrer_name}${before.referrer_phone ? ` (${before.referrer_phone})` : ""}`),
    orNone(after.referrerName && `${after.referrerName}${after.referrerPhone ? ` (${after.referrerPhone})` : ""}`),
  );
  if ((before.notes ?? "") !== (after.notes ?? "")) changes.push("Notes updated");
  return changes;
}

export type UpdateResult =
  | { ok: true; trip_no: string; changes: string[] }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "vehicle-busy"; clash: Clash | null };

/** Saves edited booking details. Its fuel and other expenses move with it to a new vehicle. */
export async function updateTrip(id: number, input: TripInput, by: string): Promise<UpdateResult> {
  const before = await getTripById(id);
  if (!before) return { ok: false, reason: "missing" };
  const [names] = await query<{ vehicle: string; driver: string }>(
    `SELECT (SELECT name FROM vehicles WHERE id = $1) AS vehicle, (SELECT name FROM drivers WHERE id = $2) AS driver`,
    [input.vehicleId, input.driverId],
  );
  const changes = describeChanges(before, input, names);
  if (changes.length === 0) return { ok: true, trip_no: before.trip_no, changes };
  try {
    await query(
      `WITH t AS (
         UPDATE trips SET vehicle_id = $2, driver_id = $3, customer_name = $4, customer_phone = $5,
                start_date = $6, end_date = $7, pickup_state = $8, pickup_city = $9, drop_state = $10, drop_city = $11,
                round_trip = $12, dest_state = $13, dest_city = $14, referrer_name = $15, referrer_phone = $16, notes = $17,
                updated_at = now(), updated_by = $18
         WHERE id = $1 RETURNING id, vehicle_id
       )
       UPDATE vehicle_expenses e SET vehicle_id = t.vehicle_id FROM t WHERE e.trip_id = t.id AND e.vehicle_id <> t.vehicle_id`,
      [
        id, input.vehicleId, input.driverId, input.customerName, input.customerPhone, input.startDate, input.endDate,
        input.pickupState, input.pickupCity, input.dropState, input.dropCity, input.roundTrip, input.destState, input.destCity,
        input.referrerName, input.referrerPhone, input.notes, by,
      ],
    );
  } catch (err) {
    if (dbErrorCode(err) !== EXCLUSION_VIOLATION) throw err;
    return { ok: false, reason: "vehicle-busy", clash: await findClash("vehicle_id", input.vehicleId, input.startDate, input.endDate, id) };
  }
  return { ok: true, trip_no: before.trip_no, changes };
}

/** Odometer readings (or km typed in instead) and agreed amounts; returns what changed (empty when nothing did) */
export async function updateReadings(id: number, r: TripReadings, by: string): Promise<{ trip_no: string; changes: string[] } | null> {
  const before = await getTripById(id);
  if (!before) return null;
  const num = (n: number | null, unit: "km" | "rs") => (n === null ? "not set" : unit === "km" ? formatNumber(n) : formatRupees(n));
  const changes: string[] = [];
  const add = (label: string, from: number | null, to: number | null, unit: "km" | "rs") =>
    from !== to && changes.push(`${label}: ${num(from, unit)} → ${num(to, unit)}`);
  add("Odometer at start", before.odometer_start, r.odometerStart, "km");
  add("Odometer at end", before.odometer_end, r.odometerEnd, "km");
  add("Km entered", before.km_direct, r.kmDirect, "km");
  add("Total from customer", before.total_amount, r.totalAmount, "rs");
  add("Driver amount", before.driver_amount, r.driverAmount, "rs");
  if (changes.length === 0) return { trip_no: before.trip_no, changes };
  const km = kmOf({ odometer_start: r.odometerStart, odometer_end: r.odometerEnd, km_direct: r.kmDirect });
  if (km !== null && km !== kmOf(before) && r.kmDirect === null) changes.push(`${formatNumber(km)} km travelled`);

  await query(
    `UPDATE trips SET odometer_start = $2, odometer_end = $3, km_direct = $4, total_amount = $5, driver_amount = $6,
            updated_at = now(), updated_by = $7
     WHERE id = $1`,
    [id, r.odometerStart, r.odometerEnd, r.kmDirect, r.totalAmount, r.driverAmount, by],
  );
  return { trip_no: before.trip_no, changes };
}

/** Cancel a booking (frees the vehicle's dates) or restore it */
export async function setTripStatus(id: number, status: "booked" | "cancelled", by: string): Promise<
  { ok: true; trip_no: string } | { ok: false; reason: "missing" } | { ok: false; reason: "vehicle-busy"; clash: Clash | null }
> {
  try {
    const [row] = await query<{ trip_no: string }>(
      `UPDATE trips SET status = $2, updated_at = now(), updated_by = $3 WHERE id = $1 AND status <> $2 RETURNING trip_no`,
      [id, status, by],
    );
    return row ? { ok: true, trip_no: row.trip_no } : { ok: false, reason: "missing" };
  } catch (err) {
    if (dbErrorCode(err) !== EXCLUSION_VIOLATION) throw err;
    const trip = await getTripById(id);
    return {
      ok: false,
      reason: "vehicle-busy",
      clash: trip ? await findClash("vehicle_id", trip.vehicle_id, trip.start_date, trip.end_date, id) : null,
    };
  }
}

// ---------- Payments ----------

export type Party = "customer" | "driver";

export type Payment = {
  id: number;
  party: Party;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  paid_ist: string;
  created_ist: string;
  created_by: string | null;
  /** Recorded more than an hour after the money changed hands */
  late_entry: boolean;
  deleted_ist: string | null;
  deleted_by: string | null;
};

export async function listPayments(tripId: number): Promise<Payment[]> {
  return query<Payment>(
    `SELECT id::int AS id, party, amount::float8 AS amount, method, note, created_by, deleted_by,
            to_char(paid_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS paid_ist,
            to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
            created_at - paid_at > interval '1 hour' AS late_entry,
            to_char(deleted_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS deleted_ist
     FROM trip_payments WHERE trip_id = $1
     ORDER BY paid_at, id`,
    [tripId],
  );
}

/** Records money received from the customer or paid to the driver. paidAt is Indian time, "YYYY-MM-DDTHH:MM". */
export async function addPayment(
  tripId: number,
  p: { party: Party; amount: number; method: PaymentMethod; paidAt: string; note: string | null },
  by: string,
): Promise<{ trip_no: string } | null> {
  const [row] = await query<{ trip_no: string }>(
    `WITH t AS (SELECT id, trip_no FROM trips WHERE id = $1 AND status = 'booked'),
     ins AS (
       INSERT INTO trip_payments (trip_id, party, amount, method, paid_at, note, created_by)
       SELECT id, $2, $3, $4, $5::timestamp AT TIME ZONE 'Asia/Kolkata', $6, $7 FROM t
     )
     SELECT trip_no FROM t`,
    [tripId, p.party, p.amount, p.method, p.paidAt, p.note, by],
  );
  return row ?? null;
}

/** Crosses out a payment entered by mistake (it stays visible as removed) */
export async function removePayment(
  id: number,
  by: string,
): Promise<{ trip_no: string; party: Party; amount: number; method: PaymentMethod } | null> {
  const [row] = await query<{ trip_no: string; party: Party; amount: number; method: PaymentMethod }>(
    `UPDATE trip_payments p SET deleted_at = now(), deleted_by = $2
     FROM trips t
     WHERE p.id = $1 AND p.deleted_at IS NULL AND t.id = p.trip_id
     RETURNING t.trip_no, p.party, p.amount::float8 AS amount, p.method`,
    [id, by],
  );
  return row ?? null;
}

export function paymentText(p: { amount: number; method: PaymentMethod; note?: string | null }): string {
  return [formatRupees(p.amount), PAYMENT_METHODS[p.method], p.note].filter(Boolean).join(" · ");
}

// ---------- Costs: fuel and other expenses of a booking; repairs, FASTag, EMI and insurance of a vehicle ----------

export type ExpenseKind = "fuel" | "other" | "repair" | "fastag" | "emi" | "insurance";

export const EXPENSE_LABELS: Record<ExpenseKind, string> = {
  fuel: "Fuel",
  other: "Other expense",
  repair: "Repair",
  fastag: "FASTag",
  emi: "EMI",
  insurance: "Insurance",
};

export type Expense = {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  trip_no: string | null;
  kind: ExpenseKind;
  amount: number;
  spent_on: string;
  litres: number | null;
  description: string | null;
  shop_name: string | null;
  shop_state: string | null;
  shop_city: string | null;
  /** EMI: the month it pays for, "YYYY-MM" */
  period: string | null;
  note: string | null;
  created_ist: string;
  created_by: string | null;
  deleted_ist: string | null;
  deleted_by: string | null;
};

const EXPENSE_SELECT = `
  SELECT e.id::int AS id, e.vehicle_id::int AS vehicle_id, v.name AS vehicle_name, t.trip_no, e.kind,
         e.amount::float8 AS amount, e.spent_on::text AS spent_on, e.litres::float8 AS litres, e.description,
         e.shop_name, e.shop_state, e.shop_city, to_char(e.period, 'YYYY-MM') AS period, e.note, e.created_by, e.deleted_by,
         to_char(e.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
         to_char(e.deleted_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS deleted_ist
  FROM vehicle_expenses e
  JOIN vehicles v ON v.id = e.vehicle_id
  LEFT JOIN trips t ON t.id = e.trip_id`;

export async function tripExpenses(tripId: number): Promise<Expense[]> {
  return query<Expense>(`${EXPENSE_SELECT} WHERE e.trip_id = $1 ORDER BY e.spent_on, e.id`, [tripId]);
}

/** One page of a vehicle's fuel or repairs (with or without a booking), newest first */
export async function vehicleExpenses(
  vehicleId: number,
  kind: ExpenseKind,
  { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {},
): Promise<{ expenses: Expense[]; total: number; sum: number }> {
  const [{ total, sum }] = await query<{ total: number; sum: number }>(
    `SELECT count(*)::int AS total, coalesce(sum(amount) FILTER (WHERE deleted_at IS NULL), 0)::float8 AS sum
     FROM vehicle_expenses WHERE vehicle_id = $1 AND kind = $2`,
    [vehicleId, kind],
  );
  const expenses = await query<Expense>(
    `${EXPENSE_SELECT} WHERE e.vehicle_id = $1 AND e.kind = $2 ORDER BY e.spent_on DESC, e.id DESC LIMIT $3 OFFSET $4`,
    [vehicleId, kind, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { expenses, total, sum };
}

/** Total of one kind of cost for one vehicle in a month */
export type VehicleCostTotal = { vehicle_id: number; vehicle_name: string; entries: number; amount: number };

/**
 * One page of repairs or FASTag recharges over every vehicle (or one), dated in a month ("YYYY-MM"), newest first,
 * with the month's total and each vehicle's share. Removed entries are listed but not counted.
 */
export async function listCosts(
  kind: ExpenseKind,
  { month, vehicleId = null, page = 1, pageSize = 10 }: { month: string; vehicleId?: number | null; page?: number; pageSize?: number },
): Promise<{ expenses: Expense[]; total: number; sum: number; byVehicle: VehicleCostTotal[] }> {
  const where = `e.kind = $1 AND e.spent_on >= $2::date AND e.spent_on < ($2::date + interval '1 month')::date`;
  const params = [kind, `${month}-01`];
  const [[{ total, sum }], byVehicle] = await Promise.all([
    query<{ total: number; sum: number }>(
      `SELECT count(*)::int AS total, coalesce(sum(e.amount) FILTER (WHERE e.deleted_at IS NULL), 0)::float8 AS sum
       FROM vehicle_expenses e WHERE ${where} AND ($3::bigint IS NULL OR e.vehicle_id = $3)`,
      [...params, vehicleId],
    ),
    query<VehicleCostTotal>(
      `SELECT v.id::int AS vehicle_id, v.name AS vehicle_name, count(*)::int AS entries, sum(e.amount)::float8 AS amount
       FROM vehicle_expenses e JOIN vehicles v ON v.id = e.vehicle_id
       WHERE ${where} AND e.deleted_at IS NULL
       GROUP BY v.id, v.name ORDER BY sum(e.amount) DESC, lower(v.name)`,
      params,
    ),
  ]);
  const expenses = await query<Expense>(
    `${EXPENSE_SELECT} WHERE ${where} AND ($3::bigint IS NULL OR e.vehicle_id = $3)
     ORDER BY e.spent_on DESC, e.id DESC LIMIT $4 OFFSET $5`,
    [...params, vehicleId, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { expenses, total, sum, byVehicle };
}

/** Suggested names for a booking's other expenses (any other name can be typed in) */
export const OTHER_EXPENSE_NAMES = [
  "Toll",
  "Parking",
  "State permit / entry tax",
  "Driver food",
  "Driver room",
  "Car wash",
  "Fine / challan",
] as const;

/** The suggested names, then names typed in on earlier bookings (most used first) */
export async function otherExpenseNames(): Promise<string[]> {
  const used = await query<{ name: string }>(
    `SELECT min(description) AS name FROM vehicle_expenses
     WHERE kind = 'other' AND description IS NOT NULL AND deleted_at IS NULL
     GROUP BY lower(description) ORDER BY count(*) DESC, lower(min(description)) LIMIT 30`,
  );
  const known = new Set<string>(OTHER_EXPENSE_NAMES.map((n) => n.toLowerCase()));
  return [...OTHER_EXPENSE_NAMES, ...used.map((u) => u.name).filter((n) => !known.has(n.toLowerCase()))];
}

export type ExpenseInput = {
  kind: ExpenseKind;
  amount: number;
  spentOn: string;
  litres: number | null;
  description: string | null;
  shopName: string | null;
  shopState: string | null;
  shopCity: string | null;
  /** EMI: the month it pays for, "YYYY-MM" */
  period?: string | null;
  note: string | null;
};

/**
 * Adds a cost, either fuel to a booking (the booking's vehicle is used) or any cost to a vehicle directly.
 * Returns the booking number or vehicle name for the activity log, or null if it no longer exists.
 */
export async function addExpense(
  target: { tripId: number } | { vehicleId: number },
  e: ExpenseInput,
  by: string,
): Promise<{ vehicle_name: string; trip_no: string | null } | null> {
  const source =
    "tripId" in target
      ? `SELECT t.id AS trip_id, t.vehicle_id, t.trip_no, v.name AS vehicle_name FROM trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = $1 AND t.status = 'booked'`
      : `SELECT NULL::bigint AS trip_id, v.id AS vehicle_id, NULL::text AS trip_no, v.name AS vehicle_name FROM vehicles v WHERE v.id = $1`;
  const [row] = await query<{ vehicle_name: string; trip_no: string | null }>(
    `WITH src AS (${source}),
     ins AS (
       INSERT INTO vehicle_expenses (vehicle_id, trip_id, kind, amount, spent_on, litres, description,
                                     shop_name, shop_state, shop_city, note, created_by, period)
       SELECT vehicle_id, trip_id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date FROM src
     )
     SELECT vehicle_name, trip_no FROM src`,
    [
      "tripId" in target ? target.tripId : target.vehicleId,
      e.kind, e.amount, e.spentOn, e.litres, e.description, e.shopName, e.shopState, e.shopCity, e.note, by,
      e.period ? `${e.period}-01` : null,
    ],
  );
  return row ?? null;
}

/** Crosses out a fuel or repair entry made by mistake */
export async function removeExpense(id: number, by: string): Promise<Expense | null> {
  const [row] = await query<{ id: number }>(
    `UPDATE vehicle_expenses SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id::int AS id`,
    [id, by],
  );
  if (!row) return null;
  const [expense] = await query<Expense>(`${EXPENSE_SELECT} WHERE e.id = $1`, [row.id]);
  return expense ?? null;
}

/**
 * "₹3,500 · 35 L", "₹2,400 · Engine oil change · Sai Motors, Guntur", "₹1,000 · FASTag recharge · Paytm",
 * "₹18,500 · EMI for October 2026 · HDFC Bank"
 */
export function expenseText(
  e: Pick<Expense, "kind" | "amount" | "litres" | "description" | "shop_name" | "shop_city" | "shop_state" | "note"> & { period?: string | null },
): string {
  const place = placeText(e.shop_city, e.shop_state);
  const month = e.period ? `${MONTHS_LONG[Number(e.period.slice(5)) - 1]} ${e.period.slice(0, 4)}` : null;
  const parts =
    e.kind === "fuel"
      ? [formatRupees(e.amount), e.litres ? `${e.litres} L` : null, e.note]
      : e.kind === "emi"
        ? [formatRupees(e.amount), month ? `EMI for ${month}` : "EMI", e.description, e.note]
        : e.kind === "insurance"
          ? [formatRupees(e.amount), "Insurance premium", e.description, e.note]
          : e.kind === "fastag"
            ? [formatRupees(e.amount), "FASTag recharge", e.description, e.note]
            : e.kind === "other"
              ? [formatRupees(e.amount), e.description, e.note]
            : [formatRupees(e.amount), e.description, [e.shop_name, place].filter(Boolean).join(", ") || null, e.note];
  return parts.filter(Boolean).join(" · ");
}

// ---------- Monthly reports ----------

const MONTH_START = `$1::date`;
const MONTH_END = `($1::date + interval '1 month')::date`;
const IN_MONTH_START = `b.start_date >= ${MONTH_START} AND b.start_date < ${MONTH_END}`;

/** Every booking (cancelled too) starting in the month ("YYYY-MM"), by date */
export async function tripsStartingIn(month: string): Promise<Trip[]> {
  return query<Trip>(
    `${TRIP_SELECT} WHERE t.start_date >= ${MONTH_START} AND t.start_date < ${MONTH_END} ORDER BY t.start_date, t.id`,
    [`${month}-01`],
  );
}

export type PaymentRow = Payment & {
  paid_date: string;
  paid_time: string;
  trip_no: string;
  customer_name: string;
  vehicle_name: string;
  driver_name: string;
};

/** Every payment (removed ones too) made in the month, by time */
export async function paymentsIn(month: string): Promise<PaymentRow[]> {
  return query<PaymentRow>(
    `SELECT p.id::int AS id, p.party, p.amount::float8 AS amount, p.method, p.note, p.created_by, p.deleted_by,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS paid_date,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS paid_time,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS paid_ist,
            to_char(p.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS created_ist,
            false AS late_entry,
            to_char(p.deleted_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS deleted_ist,
            t.trip_no, t.customer_name, v.name AS vehicle_name, d.name AS driver_name
     FROM trip_payments p
     JOIN trips t ON t.id = p.trip_id
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date >= ${MONTH_START}
       AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date < ${MONTH_END}
     ORDER BY p.paid_at, p.id`,
    [`${month}-01`],
  );
}

/** Other expenses (removed ones too) of the bookings starting in the month, booking by booking */
export async function otherExpensesForMonth(month: string): Promise<Expense[]> {
  return query<Expense>(
    `${EXPENSE_SELECT} WHERE e.kind = 'other' AND t.start_date >= ${MONTH_START} AND t.start_date < ${MONTH_END}
     ORDER BY t.start_date, t.id, e.spent_on, e.id`,
    [`${month}-01`],
  );
}

/** Every vehicle cost (removed ones too) dated in the month; only one kind when given */
export async function expensesIn(month: string, kind: ExpenseKind | null = null): Promise<Expense[]> {
  return query<Expense>(
    `${EXPENSE_SELECT} WHERE e.spent_on >= ${MONTH_START} AND e.spent_on < ${MONTH_END} AND ($2::text IS NULL OR e.kind = $2)
     ORDER BY e.spent_on, e.id`,
    [`${month}-01`, kind],
  );
}

// ---------- A driver's page ----------

export type DriverSummary = {
  /** Bookings that weren't cancelled */
  bookings: number;
  days: number;
  km: number;
  /** Agreed driver amounts, paid to the driver, and still to pay */
  earned: number;
  paid: number;
  owed: number;
};

export async function driverSummary(driverId: number): Promise<DriverSummary> {
  const [row] = await query<DriverSummary>(
    `SELECT count(*)::int AS bookings,
            coalesce(sum(t.end_date - t.start_date + 1), 0)::int AS days,
            coalesce(sum(coalesce(t.odometer_end - t.odometer_start, t.km_direct)), 0)::int AS km,
            coalesce(sum(t.driver_amount), 0)::float8 AS earned,
            coalesce(sum(pay.driver_paid), 0)::float8 AS paid,
            coalesce(sum(greatest(coalesce(t.driver_amount, 0) - pay.driver_paid, 0)), 0)::float8 AS owed
     FROM trips t
     CROSS JOIN LATERAL (
       SELECT coalesce(sum(p.amount), 0) AS driver_paid FROM trip_payments p
       WHERE p.trip_id = t.id AND p.party = 'driver' AND p.deleted_at IS NULL
     ) pay
     WHERE t.driver_id = $1 AND t.status = 'booked'`,
    [driverId],
  );
  return row;
}

/** A driver's figures for one month */
export type DriverMonth = {
  id: number;
  name: string;
  phone: string;
  active: boolean;
  /** Bookings starting in the month (not cancelled), their days, km and agreed driver amounts */
  bookings: number;
  days: number;
  km: number;
  earned: number;
  /** Paid so far for those bookings, and still to pay for them */
  paidForMonth: number;
  owedForMonth: number;
  /** Payments made to the driver during the month, for any booking */
  paidInMonth: number;
  /** Still to pay over all bookings, any month */
  owedAll: number;
};

/** Every driver in use, plus switched-off drivers who drove or were paid in the month ("YYYY-MM") */
export async function driversMonth(month: string): Promise<DriverMonth[]> {
  const rows = await query<DriverMonth>(
    `WITH b AS (
       SELECT t.id, t.driver_id, t.start_date, t.end_date, t.driver_amount,
              coalesce(t.odometer_end - t.odometer_start, t.km_direct) AS km,
              (SELECT coalesce(sum(p.amount), 0) FROM trip_payments p
               WHERE p.trip_id = t.id AND p.party = 'driver' AND p.deleted_at IS NULL) AS paid
       FROM trips t WHERE t.status = 'booked'
     )
     SELECT d.id::int AS id, d.name, d.phone, d.active,
            count(b.id) FILTER (WHERE ${IN_MONTH_START})::int AS bookings,
            coalesce(sum(b.end_date - b.start_date + 1) FILTER (WHERE ${IN_MONTH_START}), 0)::int AS days,
            coalesce(sum(b.km) FILTER (WHERE ${IN_MONTH_START}), 0)::int AS km,
            coalesce(sum(b.driver_amount) FILTER (WHERE ${IN_MONTH_START}), 0)::float8 AS earned,
            coalesce(sum(b.paid) FILTER (WHERE ${IN_MONTH_START}), 0)::float8 AS "paidForMonth",
            coalesce(sum(greatest(coalesce(b.driver_amount, 0) - b.paid, 0)) FILTER (WHERE ${IN_MONTH_START}), 0)::float8 AS "owedForMonth",
            (SELECT coalesce(sum(p.amount), 0)::float8 FROM trip_payments p JOIN trips t ON t.id = p.trip_id
             WHERE t.driver_id = d.id AND p.party = 'driver' AND p.deleted_at IS NULL
               AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date >= ${MONTH_START}
               AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date < ${MONTH_END}) AS "paidInMonth",
            coalesce(sum(greatest(coalesce(b.driver_amount, 0) - b.paid, 0)), 0)::float8 AS "owedAll"
     FROM drivers d
     LEFT JOIN b ON b.driver_id = d.id
     GROUP BY d.id
     ORDER BY d.active DESC, lower(d.name)`,
    [`${month}-01`],
  );
  return rows.filter((d) => d.active || d.bookings || d.paidInMonth);
}

/** One page of a driver's bookings, newest first */
export async function driverTrips(
  driverId: number,
  { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {},
): Promise<{ trips: Trip[]; total: number }> {
  const [{ total }] = await query<{ total: number }>(`SELECT count(*)::int AS total FROM trips WHERE driver_id = $1`, [driverId]);
  const trips = await query<Trip>(
    `${TRIP_SELECT} WHERE t.driver_id = $1 ORDER BY t.start_date DESC, t.id DESC LIMIT $2 OFFSET $3`,
    [driverId, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { trips, total };
}

/** The driver's bookings that still have money to be paid to them, oldest first */
export async function driverUnpaidTrips(driverId: number): Promise<Trip[]> {
  return query<Trip>(
    `${TRIP_SELECT} WHERE t.driver_id = $1 AND t.status = 'booked' AND t.driver_amount > pay.driver_paid
     ORDER BY t.start_date, t.id`,
    [driverId],
  );
}

/** One page of payments made to a driver (removed ones too), newest first */
export async function driverPayments(
  driverId: number,
  { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {},
): Promise<{ payments: PaymentRow[]; total: number }> {
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM trip_payments p JOIN trips t ON t.id = p.trip_id
     WHERE t.driver_id = $1 AND p.party = 'driver'`,
    [driverId],
  );
  const payments = await query<PaymentRow>(
    `SELECT p.id::int AS id, p.party, p.amount::float8 AS amount, p.method, p.note, p.created_by, p.deleted_by,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS paid_date,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS paid_time,
            to_char(p.paid_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS paid_ist,
            to_char(p.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
            p.created_at - p.paid_at > interval '1 hour' AS late_entry,
            to_char(p.deleted_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS deleted_ist,
            t.trip_no, t.customer_name, v.name AS vehicle_name, d.name AS driver_name
     FROM trip_payments p
     JOIN trips t ON t.id = p.trip_id
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.driver_id = $1 AND p.party = 'driver'
     ORDER BY p.paid_at DESC, p.id DESC
     LIMIT $2 OFFSET $3`,
    [driverId, pageSize, (Math.max(1, page) - 1) * pageSize],
  );
  return { payments, total };
}
