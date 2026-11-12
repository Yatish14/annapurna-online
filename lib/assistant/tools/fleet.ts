import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { emiStatus, insuranceStatus, listFinance, monthText } from "@/lib/expenses/finance";
import { listDrivers, listVehicles } from "@/lib/expenses/fleet";
import { vehicleProfit, vehiclesMonth } from "@/lib/expenses/overview";
import { driversMonth } from "@/lib/expenses/trips";
import { toolReply } from "./result";

/**
 * vehicle_summary and driver_summary: how each vehicle and each driver is doing. The business has only a few of
 * each, so both tools return all of them and the model picks the one asked about. All the figures come from the
 * same code as the Fleet page, the EMI page and the monthly reports, so the answers match those pages.
 */

/** "2026-11": a month, for "this month", "last month", "in October" */
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "A month like 2026-11")
  .optional()
  .describe("A month as YYYY-MM (2026-11 is November 2026). Leave out for all-time totals only.");

export const vehicleSummary = tool(
  async ({ month }) => {
    const [vehicles, finance, monthly] = await Promise.all([listVehicles(), listFinance(), month ? vehiclesMonth(month) : null]);
    if (!vehicles.length) return toolReply({ status: "none", data: null, note: "No vehicles are set up yet." });

    const rows = vehicles.map((v) => {
      const f = finance.find((x) => x.id === v.id);
      const emi = f ? emiStatus(f) : { state: "none" as const };
      const insurance = f ? insuranceStatus(f) : { state: "none" as const };
      const m = monthly?.find((x) => x.id === v.id);
      return {
        vehicle: v.name,
        in_use: v.active, // false: switched off on the Fleet page
        on_trip_now: v.on_trip, // booking number, or null
        all_time: { bookings: v.trips, km: v.km, fuel: v.fuel, other_expenses: v.other, repairs: v.repairs, fastag: v.fastag },
        // EMI this month: paid / due / overdue / not-started / finished / none (no loan recorded)
        emi:
          emi.state === "none"
            ? { state: "none" }
            : { state: emi.state, month: emi.month, due_on: emi.due, emis_paid: emi.paid, emis_left: emi.left, still_to_pay: emi.remaining, emi: f?.emi_amount },
        // valid / soon (within 30 days) / expired / none (no policy recorded)
        insurance:
          insurance.state === "none" ? { state: "none" } : { state: insurance.state, ends_on: f?.insurance_to, days_left: insurance.daysLeft },
        // Only with a month: bookings starting in it, and the vehicle's own costs dated in it (as the Vehicles report counts)
        ...(month && {
          month: m
            ? {
                bookings: m.bookings,
                km: m.km,
                billed: m.billed,
                received: m.received,
                driver_amounts: m.driverAmount,
                fuel: m.fuel,
                other_expenses: m.other,
                repairs: m.repairs,
                fastag: m.fastag,
                emi: m.emi,
                insurance: m.insurance,
                profit: vehicleProfit(m), // received − driver amounts − every cost above
              }
            : null,
        }),
      };
    });
    return toolReply({ status: "found", data: { ...(month && { month: monthText(month) }), vehicles: rows } });
  },
  {
    name: "vehicle_summary",
    description:
      "How every vehicle is doing: in use or not, whether it's on a trip now, all-time bookings, km and costs " +
      "(fuel, other expenses, repairs, FASTag), its EMI status this month and its insurance status. With a month, also " +
      "that month's bookings, km, money billed and received, driver amounts, costs and profit (as the Vehicles report counts).",
    schema: z.object({ month }),
    responseFormat: "content_and_artifact",
  },
);

export const driverSummary = tool(
  async ({ month }) => {
    const [drivers, monthly] = await Promise.all([listDrivers(), month ? driversMonth(month) : null]);
    if (!drivers.length) return toolReply({ status: "none", data: null, note: "No drivers are set up yet." });

    const rows = drivers.map((d) => {
      const m = monthly?.find((x) => x.id === d.id);
      return {
        driver: d.name,
        phone: d.phone,
        in_use: d.active,
        on_trip_now: d.on_trip,
        bookings_all_time: d.trips,
        we_owe_them: d.owed, // still to pay, over all bookings
        ...(month && {
          month: m
            ? {
                bookings: m.bookings, // starting in the month
                days: m.days,
                km: m.km,
                earned: m.earned, // agreed driver amounts for those bookings
                paid_for_those: m.paidForMonth,
                owed_for_those: m.owedForMonth,
                paid_during_month: m.paidInMonth, // payments made in the month, for any booking
              }
            : null,
        }),
      };
    });
    return toolReply({ status: "found", data: { ...(month && { month: monthText(month) }), drivers: rows } });
  },
  {
    name: "driver_summary",
    description:
      "How every driver is doing: phone, in use or not, whether they're on a trip now, all-time bookings and what we " +
      "still owe them. With a month, also that month's bookings, days, km, what they earned (agreed driver amounts), " +
      "what's paid and still owed for those bookings, and what was paid to them during the month.",
    schema: z.object({ month }),
    responseFormat: "content_and_artifact",
  },
);
