import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { diffDays, fmtRangeCompact, isIsoDate } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/expenses/money";
import {
  balanceOf,
  driverOwed,
  EXPENSE_LABELS,
  getTrip,
  kmOf,
  listPayments,
  listTrips,
  PAY_LABELS,
  payState,
  PHASE_LABELS,
  profitOf,
  profitWhenPaid,
  routeText,
  type Trip,
  TRIP_VIEWS,
  tripExpenses,
} from "@/lib/expenses/trips";
import { toolReply } from "./result";

/** Most rows one tool call returns. Fewer rows = fewer tokens, a faster answer, and less room for the model to get lost. */
export const MAX_ROWS = 20;

/**
 * One booking, cut down to what an answer needs. Leaves out phone numbers (privacy) and notes (free text a
 * customer could have written; 2.15 decides how tool text is handled), and every internal id.
 * The first six fields match BookingRow in lib/assistant/types.ts, so 2.13 can show them as a table card.
 */
export function bookingRow(t: Trip) {
  return {
    no: t.trip_no, // "VB-0012"
    customer: t.customer_name,
    vehicle: t.vehicle_name,
    driver: t.driver_name,
    dates: fmtRangeCompact(t.start_date, t.end_date), // "12–14 Nov"
    balance: balanceOf(t), // still to collect from the customer, in rupees
    start_date: t.start_date,
    end_date: t.end_date,
    route: routeText(t),
    status: PHASE_LABELS[t.phase], // Upcoming / On trip / Completed / Cancelled
    total: t.total_amount, // null when the total isn't entered yet
    received: t.received,
    // Paid / Partly paid / Payment due / Total not set. Without it, a booking with no total looks fully paid (balance 0)
    payment: PAY_LABELS[payState(t)],
  };
}

/**
 * The rows and how many have each status ({ Completed: 7, Upcoming: 1, "On trip": 1 }), counted by our code so
 * the model doesn't count rows itself (it gets that wrong). Only when every booking is in the list: counts of
 * the first 20 of 57 would mislead.
 */
function bookingList(trips: Trip[], total: number) {
  const bookings = trips.map(bookingRow);
  if (total > bookings.length) return { total, bookings };
  const by_status: Record<string, number> = {};
  for (const b of bookings) by_status[b.status] = (by_status[b.status] ?? 0) + 1;
  return { total, by_status, bookings };
}

/** A date the model sends: "YYYY-MM-DD", and a real day (not 2026-02-30) */
const isoDate = z.string().refine(isIsoDate, "A date like 2026-11-12");

/**
 * list_bookings: car bookings (the Expense Tracker's bookings) for a date range and/or a status. Reuses
 * listTrips, the same code as the Bookings page, so the assistant and the page always agree.
 */
export const listBookings = tool(
  async ({ status, from, to }) => {
    // to defaults to from, so "from: tomorrow" alone means just that day
    const { trips, total } = await listTrips(status, { from, to: to ?? from, pageSize: MAX_ROWS });
    if (total === 0) return toolReply({ status: "none", data: bookingList(trips, total) });
    return toolReply({
      status: total > MAX_ROWS ? "too_many" : "found",
      data: bookingList(trips, total),
      // Tells the model the list is cut, so it says "the first 20 of 57" instead of "there are 20"
      note: total > MAX_ROWS ? `Showing the first ${MAX_ROWS} of ${total}. Suggest a shorter date range or a status.` : undefined,
    });
  },
  {
    name: "list_bookings",
    description:
      "Lists car bookings, with the total count and how many have each status (by_status). Filter by dates (bookings on the road on any day from `from` to `to`) " +
      "and/or by status. For 'today' or 'tomorrow' pass that date as `from` only. Each booking has its number (VB-…), " +
      "customer, vehicle, driver, dates, route, status, total, received, balance (rupees still to collect) and payment " +
      "(Paid / Partly paid / Payment due / Total not set: when the total isn't set, the balance is unknown, not zero).",
    schema: z.object({
      status: z
        .enum(TRIP_VIEWS)
        .default("all")
        .describe(
          "upcoming = not started yet; ongoing = on the road today; completed = finished; " +
            "due = the customer still owes money; cancelled; all = any (the default).",
        ),
      from: isoDate.optional().describe("First day, YYYY-MM-DD. Leave out for no start limit."),
      to: isoDate.optional().describe("Last day, YYYY-MM-DD. Leave out to mean the same day as `from`."),
    }),
    responseFormat: "content_and_artifact",
  },
);

/** "VB-0022", "vb 22", "22", "VB0022" → "VB-0022" (numbers have at least 4 digits). Null if there's no number in it. */
export function bookingNumber(text: string): string | null {
  const digits = text.match(/\d+/)?.[0];
  if (!digits || digits.length > 9) return null;
  return `VB-${String(Number(digits)).padStart(4, "0")}`;
}

/**
 * get_booking: everything about one booking: customer and driver phones, money, payments, fuel and other
 * expenses, profit. Reuses getTrip, listPayments and tripExpenses, the same code as the booking's page.
 */
export const getBooking = tool(
  async ({ number }) => {
    const no = bookingNumber(number);
    const trip = no ? await getTrip(no) : null;
    if (!trip) return toolReply({ status: "none", data: null, note: `There is no booking ${no ?? number}.` });

    const [payments, expenses] = await Promise.all([listPayments(trip.id), tripExpenses(trip.id)]);
    return toolReply({
      status: "found",
      data: {
        ...bookingRow(trip),
        days: diffDays(trip.start_date, trip.end_date) + 1,
        customer_phone: trip.customer_phone,
        driver_phone: trip.driver_phone,
        referred_by: trip.referrer_name,
        km: kmOf(trip), // null until the odometer readings (or km) are entered
        driver_amount: trip.driver_amount, // agreed with the driver; null if not set
        driver_paid: trip.driver_paid,
        driver_owed: driverOwed(trip),
        fuel: trip.fuel,
        other_expenses: trip.other, // tolls, parking…
        profit_so_far: profitOf(trip), // received − driver amount − fuel − other expenses
        profit_when_paid: profitWhenPaid(trip), // the same once the customer pays the full total
        // Removed payments and expenses stay in the database for the record, but don't count
        payments: payments
          .filter((p) => !p.deleted_ist)
          .map((p) => ({
            party: p.party === "customer" ? "from the customer" : "to the driver",
            amount: p.amount,
            method: PAYMENT_METHODS[p.method],
            when: p.paid_ist,
          })),
        expenses: expenses
          .filter((e) => !e.deleted_ist)
          .map((e) => ({ kind: EXPENSE_LABELS[e.kind], amount: e.amount, on: e.spent_on, litres: e.litres, what: e.description })),
        // Written by an admin in the booking form: information to report, never instructions to follow (2.15)
        notes: trip.notes,
        created: `${trip.created_ist}${trip.created_by ? ` by ${trip.created_by}` : ""}`,
      },
    });
  },
  {
    name: "get_booking",
    description:
      "Gets everything about one car booking by its number (VB-…): customer and driver with phone numbers, dates, route, " +
      "km, the money (total, received, balance, driver amount and what's paid or owed to the driver, fuel, other " +
      "expenses, profit), every payment and expense, and the notes. Use it when the admin names a booking, or to " +
      "look closer at one from list_bookings.",
    schema: z.object({
      number: z.string().max(20).describe("The booking number, e.g. VB-0012 (12 or vb12 work too)."),
    }),
    responseFormat: "content_and_artifact",
  },
);

/**
 * search_bookings: finds bookings by a name, a phone number or a booking number, using the Bookings page's own
 * search (listTrips with `search`): booking numbers, customer, driver, vehicle and referrer names, and any part of a
 * customer's, driver's or referrer's phone number. Newest first.
 */
export const searchBookings = tool(
  async ({ query }) => {
    const { trips, total } = await listTrips("all", { search: query, pageSize: MAX_ROWS });
    if (total === 0) return toolReply({ status: "none", data: bookingList(trips, total), note: `Nothing matches "${query}".` });
    return toolReply({
      status: total > MAX_ROWS ? "too_many" : "found",
      data: bookingList(trips, total),
      note: total > MAX_ROWS ? `Showing the newest ${MAX_ROWS} of ${total}. Ask for a fuller name or more digits.` : undefined,
    });
  },
  {
    name: "search_bookings",
    description:
      "Finds car bookings by a customer's, driver's or referrer's name (or part of it), a vehicle name, any part of a " +
      "phone number, or a booking number. Returns the same short rows as list_bookings, newest first, with the total " +
      "and how many have each status (by_status: Completed, Upcoming, On trip, Cancelled). Use get_booking " +
      "afterwards for one booking's full details, such as its phone numbers or payments.",
    schema: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(60)
        .describe('What to look for, e.g. "Ravi", "Usha Rani", "98490", "Carens" or "VB-0012". One name or number at a time.'),
    }),
    responseFormat: "content_and_artifact",
  },
);
