import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { fmtRangeCompact, isIsoDate } from "@/lib/dates";
import { balanceOf, listTrips, PAY_LABELS, payState, PHASE_LABELS, routeText, type Trip, TRIP_VIEWS } from "@/lib/expenses/trips";
import { toolReply } from "./result";

/** Most rows one tool call returns. Fewer rows = fewer tokens, a faster answer, and less room for the model to get lost. */
const MAX_ROWS = 20;

/**
 * One booking, cut down to what an answer needs. Leaves out phone numbers (privacy) and notes (free text a
 * customer could have written; 2.15 decides how tool text is handled), and every internal id.
 * The first six fields match BookingRow in lib/assistant/types.ts, so 2.13 can show them as a table card.
 */
function bookingRow(t: Trip) {
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
    const rows = trips.map(bookingRow);
    if (total === 0) return toolReply({ status: "none", data: { total, bookings: rows } });
    return toolReply({
      status: total > MAX_ROWS ? "too_many" : "found",
      data: { total, bookings: rows },
      // Tells the model the list is cut, so it says "the first 20 of 57" instead of "there are 20"
      note: total > MAX_ROWS ? `Showing the first ${MAX_ROWS} of ${total}. Suggest a shorter date range or a status.` : undefined,
    });
  },
  {
    name: "list_bookings",
    description:
      "Lists car bookings, with the total count. Filter by dates (bookings on the road on any day from `from` to `to`) " +
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
