import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { outstanding } from "@/lib/expenses/overview";
import { listTrips } from "@/lib/expenses/trips";
import { bookingRow, MAX_ROWS } from "./bookings";
import { toolReply } from "./result";

/**
 * balances_due: money still to come in from customers, and still to pay drivers, over all bookings.
 * The totals come from outstanding(), the same SQL as the Expense Tracker overview, so they cover every booking,
 * not just the rows shown, and the model never adds up numbers itself (it gets long sums wrong).
 */
export const balancesDue = tool(
  async () => {
    // Both at once: the totals over everything, and the bookings that owe (the "due" tab of the Bookings page)
    const [totals, { trips, total }] = await Promise.all([outstanding(), listTrips("due", { pageSize: MAX_ROWS })]);
    // Biggest balance first, for "who owes the most?"
    const owing = trips
      .map(bookingRow)
      .map(({ no, customer, dates, status, total, received, balance }) => ({ no, customer, dates, status, total, received, balance }))
      .sort((a, b) => b.balance - a.balance);

    const data = {
      customers_owe: totals.customerDue, // rupees, all bookings together
      customer_bookings: totals.customerTrips, // how many bookings that is
      drivers_are_owed: totals.driverDue, // rupees we still have to pay drivers
      driver_bookings: totals.driverTrips,
      bookings_owing: owing,
    };
    if (!totals.customerTrips && !totals.driverTrips) return toolReply({ status: "none", data, note: "Nothing is owed either way." });
    return toolReply({
      status: total > MAX_ROWS ? "too_many" : "found",
      data,
      note:
        total > MAX_ROWS
          ? `bookings_owing shows ${MAX_ROWS} of the ${total} bookings that owe (biggest first among them); the totals cover all.`
          : undefined,
    });
  },
  {
    name: "balances_due",
    description:
      "Money still owed, over all bookings: what customers still have to pay us in total and how many bookings that is, " +
      "what we still have to pay drivers in total, and each booking that owes us, biggest balance first. " +
      "Use its totals for any 'how much is due' question; never add up balances yourself. " +
      "Bookings whose total isn't set yet aren't counted as owing.",
    schema: z.object({}), // no inputs
    responseFormat: "content_and_artifact",
  },
);
