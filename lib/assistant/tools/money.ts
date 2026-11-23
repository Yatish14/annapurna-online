import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { monthText } from "@/lib/expenses/finance";
import { moneyOutOf, monthSummary, outstanding } from "@/lib/expenses/overview";
import { listTrips } from "@/lib/expenses/trips";
import { monthInput, resolveMonth, unknownMonth } from "../months";
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
      .map(({ no, customer, vehicle, driver, dates, status, total, discount, received, balance }) => ({
        no,
        customer,
        vehicle,
        driver,
        dates,
        status,
        total,
        discount, // null if none; balance is already after it
        received,
        balance,
      }))
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
      "Balances are after any discount (total − discount − received). Bookings whose total isn't set yet aren't counted as owing.",
    schema: z.object({}), // no inputs
    responseFormat: "content_and_artifact",
  },
);

/**
 * month_overview: the car business for one month, as the Expense Tracker overview shows it. Uses monthSummary and
 * moneyOutOf, the overview page's own code, so the assistant's numbers always match the page's tiles.
 */
export const monthOverview = tool(
  async ({ month }) => {
    const m = resolveMonth(month); // this month when not given
    if (!m) return toolReply({ status: "failed", data: null, note: unknownMonth(month ?? "") });
    const s = await monthSummary(m);
    const moneyOut = moneyOutOf(s);
    const data = {
      month: monthText(m), // "November 2026"
      // Cash: payments actually made during the month (the overview's Money in / Money out / Net tiles)
      money_in: s.received, // from customers
      money_out: moneyOut,
      money_out_by_kind: {
        drivers: s.driverPaid,
        fuel: s.fuel,
        other_expenses: s.other, // tolls, parking…
        repairs: s.repairs,
        fastag: s.fastag,
        emi: s.emi,
        insurance: s.insurance,
      },
      net: s.received - moneyOut, // money in − money out; below zero is a loss
      // Bookings starting in the month
      bookings: s.bookings,
      km: s.km,
      billed: s.billed, // their agreed totals less discounts: what the customers pay
      discounts: s.discounts, // rupees of discount given on those bookings
      driver_amounts: s.driverAmount, // agreed with the drivers for them
    };
    const nothing = !s.bookings && !s.received && !moneyOut;
    return toolReply({ status: nothing ? "none" : "found", data, note: nothing ? `Nothing recorded for ${data.month}.` : undefined });
  },
  {
    name: "month_overview",
    description:
      "The car business for one month, as the Expense Tracker overview shows it: money in (received from customers), " +
      "money out (drivers, fuel, other expenses, repairs, FASTag, EMI, insurance, each listed) and net (in − out), " +
      "all counting payments made during the month; plus the bookings starting in the month, their km, the amount " +
      "billed (after discounts), the discounts given on them and the driver amounts agreed. Use it for cash questions: " +
      "'how much came in this month', 'what did we spend on fuel', and for 'how much discount did we give'. Net here is cash in − cash out, not profit: for a month's profit, use report (the Reports " +
      "page's profit, by the bookings starting in the month); for one vehicle's profit, use vehicle_summary.",
    schema: z.object({ month: monthInput.optional().describe(`${monthInput.description} Leave out for this month.`) }),
    responseFormat: "content_and_artifact",
  },
);
