import { query } from "@/lib/db";
import { addDays, fmtRange, todayIST } from "@/lib/dates";
import { getTrip, type Trip } from "@/lib/expenses/trips";
import { matchName } from "../match";
import { bookingNumber } from "./bookings";
import { freeText } from "./result";

/**
 * The booking an admin means by "VB-0012" or by a customer's name ("Padma"), for the payment and fuel drafts
 * (4.9, 4.10). Our code finds it among bookings that aren't cancelled; when the name fits several, the choices come
 * back so the admin can be asked which (the model never chooses, 4.3).
 */

/** More bookings than this for one name aren't listed: the admin is asked for the booking number instead */
const MAX_CHOICES = 8;

/** How far back a customer's name is looked for (older bookings need their number) */
const LOOK_BACK_DAYS = 120;

type Candidate = { trip_no: string; name: string; phone: string; start_date: string; end_date: string };

/** Bookings a payment or fuel could be for, found by the customer's name: not cancelled, from the last few months on */
async function recentBookings(): Promise<Candidate[]> {
  return query<Candidate>(
    `SELECT trip_no, customer_name AS name, customer_phone AS phone,
            to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM trips WHERE status = 'booked' AND end_date >= $1::date ORDER BY start_date`,
    [addDays(todayIST(), -LOOK_BACK_DAYS)],
  );
}

const label = (c: Candidate) => `${c.trip_no} · ${freeText(c.name, 60)} · ${fmtRange(c.start_date, c.end_date)}`;

/** The booking the admin meant, or what to ask */
export async function findBooking(said: string): Promise<Trip | { why: string; choices?: string[] }> {
  if (/^\s*vb[-\s]?\d+\s*$/i.test(said)) {
    const no = bookingNumber(said)!;
    return (await getTrip(no)) ?? { why: `There's no booking ${no}.` };
  }
  const match = matchName(said, await recentBookings());
  if (match.found) return (await getTrip(match.found.trip_no))!;
  const { candidates } = match;
  if (candidates.length > MAX_CHOICES) return { why: `"${said}" has ${candidates.length} bookings. Ask for the booking number.` };
  if (candidates.length) return { why: `"${said}" has more than one booking.`, choices: candidates.map(label) };
  return { why: `No booking from the last ${LOOK_BACK_DAYS} days or later is for a customer called "${said}". Ask for the booking number.` };
}
