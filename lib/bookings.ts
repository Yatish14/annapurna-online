import { cache } from "react";
import { BOOKING_RULES, type BookingStatus, type CarId } from "./config";
import { addDays, diffDays, todayIST } from "./dates";
import { dbErrorCode, EXCLUSION_VIOLATION, query } from "./db";

export type Booking = {
  id: number;
  ref: string;
  phone: string;
  customer_name: string | null;
  car: CarId;
  adults: number;
  children: number;
  start_date: string;
  end_date: string;
  pickup_location: string;
  status: BookingStatus;
  created_ist: string;
  notified: boolean;
  notify_error: string | null;
  updated_by: string | null;
  updated_ist: string;
  /** Test data from `npm run db:seed`: no WhatsApp messages are sent */
  is_sample: boolean;
};

const COLUMNS = `
  id::int AS id, ref, phone, customer_name, car, adults, children,
  start_date::text AS start_date, end_date::text AS end_date, pickup_location, status,
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') AS created_ist,
  (notified_at IS NOT NULL) AS notified, notify_error, updated_by,
  to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') AS updated_ist, is_sample`;

// ---------- Availability (used by the WhatsApp bot) ----------

/** First day a customer can book (bookings start from tomorrow) */
export function firstBookableDate(): string {
  return addDays(todayIST(), 1);
}

/** Days already taken by confirmed bookings for this car, within the booking window */
export async function bookedDays(car: CarId): Promise<Set<string>> {
  const from = firstBookableDate();
  const to = addDays(from, BOOKING_RULES.windowDays + BOOKING_RULES.maxDays);
  const rows = await query<{ s: string; e: string }>(
    `SELECT start_date::text AS s, end_date::text AS e FROM bookings
     WHERE car = $1 AND status = 'confirmed' AND end_date >= $2 AND start_date <= $3`,
    [car, from, to],
  );
  const days = new Set<string>();
  for (const { s, e } of rows) {
    for (let d = s; d <= e; d = addDays(d, 1)) days.add(d);
  }
  return days;
}

/** Start dates the bot can offer: free days inside the booking window */
export function freeStartDates(booked: Set<string>): string[] {
  const first = firstBookableDate();
  const dates: string[] = [];
  for (let i = 0; i < BOOKING_RULES.windowDays; i++) {
    const d = addDays(first, i);
    if (!booked.has(d)) dates.push(d);
  }
  return dates;
}

/** How many days in a row the car is free from `start` (capped at the max trip length) */
export function freeDaysFrom(booked: Set<string>, start: string): number {
  let n = 0;
  while (n < BOOKING_RULES.maxDays && !booked.has(addDays(start, n))) n++;
  return n;
}

export function isBookableStart(start: string): boolean {
  const offset = diffDays(firstBookableDate(), start);
  return offset >= 0 && offset < BOOKING_RULES.windowDays;
}

// ---------- Creating enquiries ----------

export type NewEnquiry = {
  phone: string;
  customerName: string | null;
  car: CarId;
  adults: number;
  children: number;
  startDate: string;
  endDate: string;
  pickupLocation: string;
};

export async function createEnquiry(e: NewEnquiry): Promise<string> {
  const [row] = await query<{ ref: string }>(
    `INSERT INTO bookings (phone, customer_name, car, adults, children, start_date, end_date, pickup_location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ref`,
    [e.phone, e.customerName, e.car, e.adults, e.children, e.startDate, e.endDate, e.pickupLocation],
  );
  return row.ref;
}

// ---------- Dashboard ----------

export type BookingFilter = { status?: BookingStatus | "all"; car?: CarId | "all" };

export async function listBookings(filter: BookingFilter): Promise<Booking[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== "all") {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.car && filter.car !== "all") {
    params.push(filter.car);
    where.push(`car = $${params.length}`);
  }
  // Open work first in trip order; finished items newest first
  const order =
    filter.status === "pending" || filter.status === "confirmed"
      ? "start_date ASC, created_at ASC"
      : "created_at DESC";
  return query<Booking>(
    `SELECT ${COLUMNS} FROM bookings ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${order} LIMIT 300`,
    params,
  );
}

export async function getBooking(id: number): Promise<Booking | null> {
  const [row] = await query<Booking>(`SELECT ${COLUMNS} FROM bookings WHERE id = $1`, [id]);
  return row ?? null;
}

export type DashboardStats = {
  pending: number;
  upcoming: number;
  onTripToday: number;
  bookedThisMonth: number;
  byStatus: Record<BookingStatus | "all", number>;
};

// Cached per request: the layout (sidebar badge) and the page both use it
export const dashboardStats = cache(async (): Promise<DashboardStats> => {
  const today = todayIST();
  const [row] = await query<Record<string, number>>(
    `SELECT
       count(*)::int AS "all",
       count(*) FILTER (WHERE status = 'pending')::int AS pending,
       count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
       count(*) FILTER (WHERE status = 'confirmed' AND start_date > $1)::int AS upcoming,
       count(*) FILTER (WHERE status = 'confirmed' AND $1 BETWEEN start_date AND end_date)::int AS on_trip,
       count(*) FILTER (WHERE status = 'confirmed'
         AND date_trunc('month', start_date) = date_trunc('month', $1::date))::int AS this_month
     FROM bookings`,
    [today],
  );
  return {
    pending: row.pending,
    upcoming: row.upcoming,
    onTripToday: row.on_trip,
    bookedThisMonth: row.this_month,
    byStatus: {
      all: row.all,
      pending: row.pending,
      confirmed: row.confirmed,
      rejected: row.rejected,
      cancelled: row.cancelled,
    },
  };
});

/** Confirmed trips that haven't finished yet, soonest first */
export async function upcomingTrips(limit: number): Promise<Booking[]> {
  return query<Booking>(
    `SELECT ${COLUMNS} FROM bookings WHERE status = 'confirmed' AND end_date >= $1
     ORDER BY start_date LIMIT $2`,
    [todayIST(), limit],
  );
}

/** Newest pending enquiries */
export async function latestPending(limit: number): Promise<Booking[]> {
  return query<Booking>(
    `SELECT ${COLUMNS} FROM bookings WHERE status = 'pending' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

/** For each pending enquiry, the confirmed bookings it clashes with */
export async function pendingConflicts(): Promise<Map<number, string>> {
  const rows = await query<{ id: number; refs: string }>(
    `SELECT p.id::int AS id, string_agg(c.ref, ', ' ORDER BY c.start_date) AS refs
     FROM bookings p
     JOIN bookings c
       ON c.car = p.car AND c.status = 'confirmed'
      AND daterange(c.start_date, c.end_date, '[]') && daterange(p.start_date, p.end_date, '[]')
     WHERE p.status = 'pending'
     GROUP BY p.id`,
  );
  return new Map(rows.map((r) => [r.id, r.refs]));
}

export type CalendarEntry = { ref: string; car: CarId; status: BookingStatus; start_date: string; end_date: string };

export async function calendarEntries(from: string, to: string): Promise<CalendarEntry[]> {
  return query<CalendarEntry>(
    `SELECT ref, car, status, start_date::text AS start_date, end_date::text AS end_date
     FROM bookings
     WHERE status IN ('confirmed', 'pending') AND end_date >= $1 AND start_date <= $2
     ORDER BY start_date`,
    [from, to],
  );
}

// Which status changes the dashboard allows
const ALLOWED_FROM: Partial<Record<BookingStatus, BookingStatus>> = {
  confirmed: "pending",
  rejected: "pending",
  cancelled: "confirmed",
};

export type StatusChange =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "conflict" | "not-found" | "invalid" };

export async function changeStatus(id: number, to: BookingStatus, changedBy: string): Promise<StatusChange> {
  const from = ALLOWED_FROM[to];
  if (!from) return { ok: false, reason: "invalid" };
  try {
    const [row] = await query<Booking>(
      `UPDATE bookings
       SET status = $2, updated_at = now(), updated_by = $4, notified_at = NULL, notify_error = NULL
       WHERE id = $1 AND status = $3
       RETURNING ${COLUMNS}`,
      [id, to, from, changedBy],
    );
    return row ? { ok: true, booking: row } : { ok: false, reason: "not-found" };
  } catch (err) {
    if (dbErrorCode(err) === EXCLUSION_VIOLATION) return { ok: false, reason: "conflict" };
    throw err;
  }
}

export async function recordNotification(id: number, error: string | null): Promise<void> {
  await query(
    `UPDATE bookings
     SET notified_at = CASE WHEN $2::text IS NULL THEN now() ELSE NULL END, notify_error = $2
     WHERE id = $1`,
    [id, error],
  );
}
